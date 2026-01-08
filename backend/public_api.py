"""
公开验证 API - 前端直接调用 SheerID，后端只提供数据和记录结果
"""
import hmac
import hashlib
import logging
import secrets
import httpx
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from captcha_service import verify_captchas
from verification_services import get_veteran_repository, is_test_mode, VeteranData
from database import SessionLocal
from models import VerificationHistory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public"])

# 签名密钥（启动时生成）
_SIGNING_KEY = secrets.token_hex(32)

# 已使用的 token（防重放）
_used_tokens: dict = {}  # token -> expire_time
TOKEN_EXPIRE_MINUTES = 30


def _generate_token(veteran_data: dict) -> str:
    """生成带签名的 token"""
    # 数据序列化
    data_str = f"{veteran_data['first_name']}|{veteran_data['last_name']}|{veteran_data['birth_date']}|{veteran_data['org_id']}"
    # 时间戳
    timestamp = int(datetime.utcnow().timestamp())
    # 随机数
    nonce = secrets.token_hex(8)
    # 签名
    message = f"{data_str}|{timestamp}|{nonce}"
    signature = hmac.new(_SIGNING_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{timestamp}:{nonce}:{signature}"


def _verify_token(token: str, veteran_data: dict) -> bool:
    """验证 token"""
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False

        timestamp, nonce, signature = parts
        timestamp = int(timestamp)

        # 检查过期
        now = int(datetime.utcnow().timestamp())
        if now - timestamp > TOKEN_EXPIRE_MINUTES * 60:
            logger.warning(f"Token expired: {now - timestamp}s old")
            return False

        # 检查重放
        if token in _used_tokens:
            logger.warning("Token already used (replay attack)")
            return False

        # 验证签名
        data_str = f"{veteran_data['first_name']}|{veteran_data['last_name']}|{veteran_data['birth_date']}|{veteran_data['org_id']}"
        message = f"{data_str}|{timestamp}|{nonce}"
        expected = hmac.new(_SIGNING_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()[:16]

        if not hmac.compare_digest(signature, expected):
            logger.warning("Token signature mismatch")
            return False

        # 标记为已使用
        _used_tokens[token] = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)

        # 清理过期 token
        _cleanup_used_tokens()

        return True
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        return False


def _cleanup_used_tokens():
    """清理过期的已使用 token"""
    now = datetime.utcnow()
    expired = [t for t, exp in _used_tokens.items() if exp < now]
    for t in expired:
        del _used_tokens[t]


# ==================== Request Models ====================

class GetVeteranRequest(BaseModel):
    """获取 veteran 数据请求"""
    turnstile_token: Optional[str] = None
    hcaptcha_token: Optional[str] = None


class ReportResultRequest(BaseModel):
    """上报验证结果"""
    first_name: str
    last_name: str
    birth_date: str
    discharge_date: str
    org_id: int
    org_name: str
    email: str
    success: bool
    token: str  # 必须携带从 /veteran/next 获取的 token
    error_message: Optional[str] = None


# ==================== Rate Limiting ====================

_rate_limits: dict = {}
RATE_LIMIT_PER_MINUTE = 10
RATE_LIMIT_PER_HOUR = 30


def check_rate_limit(client_ip: str) -> bool:
    """检查速率限制"""
    now = datetime.utcnow()
    key = client_ip

    if key not in _rate_limits:
        _rate_limits[key] = {"minute_count": 0, "hour_count": 0, "minute_reset": now, "hour_reset": now}

    limits = _rate_limits[key]

    if (now - limits["minute_reset"]).seconds >= 60:
        limits["minute_count"] = 0
        limits["minute_reset"] = now

    if (now - limits["hour_reset"]).seconds >= 3600:
        limits["hour_count"] = 0
        limits["hour_reset"] = now

    if limits["minute_count"] >= RATE_LIMIT_PER_MINUTE:
        return False
    if limits["hour_count"] >= RATE_LIMIT_PER_HOUR:
        return False

    limits["minute_count"] += 1
    limits["hour_count"] += 1
    return True


def record_verification_history(
    first_name: str,
    last_name: str,
    birth_date: str,
    discharge_date: str,
    org_id: int,
    org_name: str,
    email: str,
    success: bool,
    client_ip: Optional[str] = None,
    error_message: Optional[str] = None
):
    """记录验证历史"""
    try:
        db = SessionLocal()
        history = VerificationHistory(
            first_name=first_name,
            last_name=last_name,
            birth_date=birth_date,
            discharge_date=discharge_date,
            org_id=org_id,
            org_name=org_name,
            email=email,
            client_ip=client_ip,
            success=success,
            error_message=error_message,
        )
        db.add(history)
        db.commit()
        db.close()
        logger.info(f"Recorded: {email} from {client_ip} - {'success' if success else 'failed'}")
    except Exception as e:
        logger.error(f"Failed to record history: {e}")


# ==================== API Endpoints ====================

@router.get("/status")
async def get_service_status():
    """获取服务状态"""
    return {
        "status": "ok",
        "test_mode": is_test_mode(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/veteran/next")
async def get_next_veteran(request: Request, data: GetVeteranRequest):
    """
    获取下一个待验证的 veteran 数据
    前端拿到数据后直接调用 SheerID API
    """
    client_ip = request.client.host if request.client else "unknown"

    # 速率限制
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")

    # 验证 Captcha
    await verify_captchas(
        turnstile_token=data.turnstile_token,
        hcaptcha_token=data.hcaptcha_token,
        remote_ip=client_ip,
        require_both=False,
    )

    # 获取 veteran 数据
    repo = get_veteran_repository()
    veteran = repo.next_pending()

    if not veteran:
        raise HTTPException(status_code=404, detail="没有可用的验证数据")

    veteran_data = {
        "first_name": veteran.first_name,
        "last_name": veteran.last_name,
        "birth_date": veteran.birth_date,
        "discharge_date": veteran.discharge_date,
        "org_id": veteran.org_id,
        "org_name": veteran.org_name,
    }

    # 生成签名 token
    token = _generate_token(veteran_data)

    return {
        "success": True,
        "veteran": veteran_data,
        "token": token,  # 前端必须在 report 时带上此 token
    }


@router.post("/verify/report")
async def report_verification_result(request: Request, data: ReportResultRequest):
    """
    上报验证结果
    前端完成 SheerID 验证后调用此接口记录结果
    """
    client_ip = request.client.host if request.client else "unknown"

    # 验证 token（防止伪造）
    veteran_data = {
        "first_name": data.first_name,
        "last_name": data.last_name,
        "birth_date": data.birth_date,
        "org_id": data.org_id,
    }
    if not _verify_token(data.token, veteran_data):
        raise HTTPException(status_code=403, detail="无效或过期的 token")

    # 记录历史
    record_verification_history(
        first_name=data.first_name,
        last_name=data.last_name,
        birth_date=data.birth_date,
        discharge_date=data.discharge_date,
        org_id=data.org_id,
        org_name=data.org_name,
        email=data.email,
        success=data.success,
        client_ip=client_ip,
        error_message=data.error_message,
    )

    return {"success": True, "message": "结果已记录"}


# ==================== ChatGPT Token Mode ====================

class ChatGPTTokenRequest(BaseModel):
    access_token: str


@router.post("/chatgpt/get-sheerid-url")
async def get_sheerid_url_from_token(data: ChatGPTTokenRequest):
    """
    使用 ChatGPT accessToken 获取 SheerID 验证链接
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.post(
                "https://chatgpt.com/backend-api/veterans/create_verification",
                headers={
                    "Authorization": f"Bearer {data.access_token}",
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Origin": "https://chatgpt.com",
                    "Referer": "https://chatgpt.com/veterans-claim",
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                },
                json={"program_id": "690415d58971e73ca187d8c9"}
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"ChatGPT API 返回错误: {response.status_code}"
                )

            result = response.json()
            return {
                "success": True,
                "sheerid_url": result.get("url") or result.get("verification_url") or result,
            }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="请求超时")
    except Exception as e:
        logger.error(f"ChatGPT Token API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

