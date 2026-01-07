"""
公开验证 API - 前端直接调用 SheerID，后端只提供数据和记录结果
"""
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from captcha_service import verify_captchas
from verification_services import get_veteran_repository, is_test_mode, VeteranData
from database import SessionLocal
from models import VerificationHistory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public"])


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
    error_message: Optional[str] = None
    turnstile_token: Optional[str] = None
    hcaptcha_token: Optional[str] = None


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
            success=success,
            error_message=error_message,
        )
        db.add(history)
        db.commit()
        db.close()
        logger.info(f"Recorded: {first_name} {last_name} - {'success' if success else 'failed'}")
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

    return {
        "success": True,
        "veteran": {
            "first_name": veteran.first_name,
            "last_name": veteran.last_name,
            "birth_date": veteran.birth_date,
            "discharge_date": veteran.discharge_date,
            "org_id": veteran.org_id,
            "org_name": veteran.org_name,
        }
    }


@router.post("/verify/report")
async def report_verification_result(request: Request, data: ReportResultRequest):
    """
    上报验证结果
    前端完成 SheerID 验证后调用此接口记录结果
    """
    client_ip = request.client.host if request.client else "unknown"

    # 可选的 Captcha 验证
    if data.turnstile_token or data.hcaptcha_token:
        await verify_captchas(
            turnstile_token=data.turnstile_token,
            hcaptcha_token=data.hcaptcha_token,
            remote_ip=client_ip,
            require_both=False,
        )

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
        error_message=data.error_message,
    )

    return {"success": True, "message": "结果已记录"}
