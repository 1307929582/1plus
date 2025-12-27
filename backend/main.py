"""
FastAPI 主应用
"""
import csv
import io
import secrets
import hashlib
import httpx
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db, init_db, engine
from models import Base, Veteran, RedeemCode, CodeUsage, Admin, VerificationLog, VerificationStatus, LinuxDOUser, OAuthSettings, ProxySettings
from sheerid_service import verify_veteran, verify_veteran_step1, complete_email_loop, extract_token_from_url
from proxy_config import get_proxy_status

app = FastAPI(title="SheerID Veteran Verification API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()


# ==================== Pydantic Models ====================

class AdminLogin(BaseModel):
    username: str
    password: str


class AdminCreate(BaseModel):
    username: str
    password: str


class RedeemCodeCreate(BaseModel):
    total_uses: int = 1
    expires_days: Optional[int] = None
    count: int = 1  # 批量生成数量


class VerifyRequest(BaseModel):
    code: str
    url: str
    email: str
    udid: Optional[str] = None


class DashboardStats(BaseModel):
    total_veterans: int
    pending_veterans: int
    verified_veterans: int
    failed_veterans: int
    total_codes: int
    active_codes: int
    total_verifications_today: int


class OAuthSettingsUpdate(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    is_enabled: Optional[bool] = None
    codes_per_user: Optional[int] = None
    min_trust_level: Optional[int] = None


class ProxySettingsUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    proxy_type: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None


# ==================== Auth ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_admin(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == credentials.username).first()
    if not admin or admin.password_hash != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Admin account disabled")
    return admin


# ==================== Admin Routes ====================

@app.get("/api/admin/exists")
def check_admin_exists(db: Session = Depends(get_db)):
    """检查是否已有管理员"""
    exists = db.query(Admin).first() is not None
    return {"exists": exists}


@app.post("/api/admin/init")
def init_admin(data: AdminCreate, db: Session = Depends(get_db)):
    """初始化管理员账户（仅当没有管理员时）"""
    existing = db.query(Admin).first()
    if existing:
        raise HTTPException(status_code=400, detail="Admin already exists")

    admin = Admin(username=data.username, password_hash=hash_password(data.password))
    db.add(admin)
    db.commit()
    return {"message": "Admin created successfully"}


@app.post("/api/admin/login")
def admin_login(data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == data.username).first()
    if not admin or admin.password_hash != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    admin.last_login = datetime.utcnow()
    db.commit()
    return {"message": "Login successful", "username": admin.username}


# ==================== Dashboard ====================

@app.get("/api/dashboard", response_model=DashboardStats)
def get_dashboard(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    today = datetime.utcnow().date()

    stats = DashboardStats(
        total_veterans=db.query(Veteran).count(),
        pending_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.PENDING).count(),
        verified_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.SUCCESS).count(),
        failed_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.FAILED).count(),
        total_codes=db.query(RedeemCode).count(),
        active_codes=db.query(RedeemCode).filter(RedeemCode.is_active == True).filter(
            RedeemCode.used_count < RedeemCode.total_uses
        ).count(),
        total_verifications_today=db.query(CodeUsage).filter(
            func.date(CodeUsage.created_at) == today
        ).count()
    )
    return stats


# ==================== Veterans ====================

@app.get("/api/veterans")
def list_veterans(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Veteran)
    if status:
        query = query.filter(Veteran.status == VerificationStatus(status))
    veterans = query.order_by(Veteran.id).offset(skip).limit(limit).all()
    total = query.count()
    return {"veterans": veterans, "total": total}


@app.post("/api/veterans/import")
async def import_veterans(
    file: UploadFile = File(...),
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """从 CSV 导入退伍军人数据"""
    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))

    count = 0
    for row in reader:
        veteran = Veteran(
            first_name=row["first_name"],
            last_name=row["last_name"],
            birth_date=row["birth_date"],
            discharge_date=row["discharge_date"],
            org_id=int(row.get("org_id", 4070)),
            org_name=row.get("org_name", "Army"),
        )
        db.add(veteran)
        count += 1

    db.commit()
    return {"message": f"成功导入 {count} 条记录"}


@app.delete("/api/veterans/{veteran_id}")
def delete_veteran(veteran_id: int, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    veteran = db.query(Veteran).filter(Veteran.id == veteran_id).first()
    if not veteran:
        raise HTTPException(status_code=404, detail="Veteran not found")
    db.delete(veteran)
    db.commit()
    return {"message": "Deleted"}


@app.post("/api/veterans/delete-batch")
def delete_veterans_batch(ids: List[int], admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """批量删除退伍军人"""
    deleted = db.query(Veteran).filter(Veteran.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"已删除 {deleted} 条记录"}


# ==================== Redeem Codes ====================

@app.get("/api/codes")
def list_codes(
    skip: int = 0,
    limit: int = 50,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    codes = db.query(RedeemCode).order_by(RedeemCode.id.desc()).offset(skip).limit(limit).all()
    total = db.query(RedeemCode).count()
    return {"codes": codes, "total": total}


@app.post("/api/codes/generate")
def generate_codes(
    data: RedeemCodeCreate,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """批量生成兑换码"""
    codes = []
    expires_at = None
    if data.expires_days:
        expires_at = datetime.utcnow() + timedelta(days=data.expires_days)

    for _ in range(data.count):
        code_str = secrets.token_urlsafe(8).upper()[:12]
        code = RedeemCode(
            code=code_str,
            total_uses=data.total_uses,
            expires_at=expires_at
        )
        db.add(code)
        codes.append(code_str)

    db.commit()
    return {"codes": codes, "count": len(codes)}


@app.delete("/api/codes/{code_id}")
def delete_code(code_id: int, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    code = db.query(RedeemCode).filter(RedeemCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    db.delete(code)
    db.commit()
    return {"message": "Deleted"}


@app.put("/api/codes/{code_id}/toggle")
def toggle_code(code_id: int, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    code = db.query(RedeemCode).filter(RedeemCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    code.is_active = not code.is_active
    db.commit()
    return {"is_active": code.is_active}


# ==================== Verification (Public) ====================

@app.post("/api/verify")
def verify_with_code(data: VerifyRequest, db: Session = Depends(get_db)):
    """使用兑换码进行验证"""
    # 验证兑换码
    code = db.query(RedeemCode).filter(RedeemCode.code == data.code).first()
    if not code:
        raise HTTPException(status_code=404, detail="兑换码不存在")
    if not code.is_active:
        raise HTTPException(status_code=400, detail="兑换码已禁用")
    if code.used_count >= code.total_uses:
        raise HTTPException(status_code=400, detail="兑换码已用完")
    if code.expires_at and code.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="兑换码已过期")

    # 获取下一个待验证的退伍军人
    veteran = db.query(Veteran).filter(Veteran.status == VerificationStatus.PENDING).first()
    if not veteran:
        raise HTTPException(status_code=404, detail="没有待验证的退伍军人")

    # 执行验证
    result = verify_veteran(
        url=data.url,
        first_name=veteran.first_name,
        last_name=veteran.last_name,
        birth_date=veteran.birth_date,
        discharge_date=veteran.discharge_date,
        org_id=veteran.org_id,
        org_name=veteran.org_name,
        email=data.email,
        client_udid=data.udid
    )

    # 更新状态
    if result["success"]:
        veteran.status = VerificationStatus.EMAIL_SENT if result.get("step") == "emailLoop" else VerificationStatus.SUCCESS
        veteran.email_used = data.email
        veteran.verified_at = datetime.utcnow()
    else:
        veteran.status = VerificationStatus.FAILED
        veteran.error_message = result.get("error", "Unknown error")

    # 记录使用
    usage = CodeUsage(
        code_id=code.id,
        veteran_id=veteran.id,
        email=data.email,
        verification_url=data.url,
        status=veteran.status,
        result_message=result.get("message") or result.get("error")
    )
    db.add(usage)

    # 更新兑换码使用次数
    code.used_count += 1

    db.commit()

    return {
        "success": result["success"],
        "message": result.get("message") or result.get("error"),
        "veteran_name": f"{veteran.first_name} {veteran.last_name}",
        "remaining_uses": code.total_uses - code.used_count
    }


# ==================== Two-Step Verification ====================

# 存储进行中的验证（verification_id -> {fingerprint, veteran_id, code_id}）
pending_verifications = {}


class VerifyStep1Request(BaseModel):
    code: str
    url: str
    email: str
    udid: Optional[str] = None


class VerifyStep2Request(BaseModel):
    verification_id: str
    token: str  # 可以是 token 或包含 token 的 URL


@app.post("/api/verify/step1")
def verify_step1(data: VerifyStep1Request, db: Session = Depends(get_db)):
    """第一步：提交验证，发送邮件"""
    # 验证兑换码
    code = db.query(RedeemCode).filter(RedeemCode.code == data.code).first()
    if not code:
        raise HTTPException(status_code=404, detail="兑换码不存在")
    if not code.is_active:
        raise HTTPException(status_code=400, detail="兑换码已禁用")
    if code.used_count >= code.total_uses:
        raise HTTPException(status_code=400, detail="兑换码已用完")
    if code.expires_at and code.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="兑换码已过期")

    # 获取退伍军人
    veteran = db.query(Veteran).filter(Veteran.status == VerificationStatus.PENDING).first()
    if not veteran:
        raise HTTPException(status_code=404, detail="没有待验证的退伍军人")

    # 执行第一步验证
    result = verify_veteran_step1(
        url=data.url,
        first_name=veteran.first_name,
        last_name=veteran.last_name,
        birth_date=veteran.birth_date,
        discharge_date=veteran.discharge_date,
        org_id=veteran.org_id,
        org_name=veteran.org_name,
        email=data.email,
        client_udid=data.udid
    )

    if result.get("success") and result.get("step") == "emailLoop":
        # 保存验证状态
        verification_id = result.get("verification_id")
        pending_verifications[verification_id] = {
            "fingerprint": result.get("fingerprint"),
            "veteran_id": veteran.id,
            "code_id": code.id,
            "email": data.email,
            "url": data.url
        }
        return {
            "success": True,
            "step": "emailLoop",
            "verification_id": verification_id,
            "message": "请检查邮箱，复制邮件中的 6 位数字验证码"
        }
    elif result.get("success") and result.get("step") == "success":
        # 直接成功（无需邮件验证）
        veteran.status = VerificationStatus.SUCCESS
        veteran.email_used = data.email
        veteran.verified_at = datetime.utcnow()
        code.used_count += 1
        db.commit()
        return {"success": True, "step": "success", "message": "验证成功！"}
    else:
        return {"success": False, "error": result.get("error", "验证失败")}


@app.post("/api/verify/step2")
def verify_step2(data: VerifyStep2Request, db: Session = Depends(get_db)):
    """第二步：提交邮件 token 完成验证"""
    # 获取保存的验证状态
    pending = pending_verifications.get(data.verification_id)
    if not pending:
        raise HTTPException(status_code=404, detail="验证会话不存在或已过期")

    # 提取 token
    token = extract_token_from_url(data.token) or data.token

    # 完成邮件验证
    result = complete_email_loop(
        verification_id=data.verification_id,
        email_token=token,
        fingerprint=pending["fingerprint"]
    )

    if result.get("success") and result.get("step") == "success":
        # 更新数据库
        veteran = db.query(Veteran).filter(Veteran.id == pending["veteran_id"]).first()
        code = db.query(RedeemCode).filter(RedeemCode.id == pending["code_id"]).first()

        if veteran and code:
            veteran.status = VerificationStatus.SUCCESS
            veteran.email_used = pending["email"]
            veteran.verified_at = datetime.utcnow()

            usage = CodeUsage(
                code_id=code.id,
                veteran_id=veteran.id,
                email=pending["email"],
                verification_url=pending["url"],
                status=VerificationStatus.SUCCESS,
                result_message="验证成功"
            )
            db.add(usage)
            code.used_count += 1
            db.commit()

        # 清理
        del pending_verifications[data.verification_id]

        return {"success": True, "message": "验证成功！"}
    else:
        return {"success": False, "error": result.get("error", "验证失败")}


# ==================== Frontend-Direct Verification ====================

import secrets

# 存储验证会话 token（防止伪造请求）
verification_tokens = {}  # token -> {veteran_id, code_id, created_at}


class GetVeteranRequest(BaseModel):
    code: str


class RecordResultRequest(BaseModel):
    veteran_id: int
    code_id: int
    success: bool
    email: str
    token: str  # 验证 token，防止伪造


@app.post("/api/verify/get-veteran")
def get_veteran_for_verification(data: GetVeteranRequest, db: Session = Depends(get_db)):
    """获取退伍军人数据供前端直接调用 SheerID"""
    try:
        print(f"[DEBUG] get-veteran called with code: {data.code}", flush=True)

        # 验证兑换码
        code = db.query(RedeemCode).filter(RedeemCode.code == data.code.upper()).first()
        if not code:
            print(f"[DEBUG] Code not found: {data.code}", flush=True)
            return {"success": False, "error": "兑换码不存在"}
        if not code.is_active:
            print(f"[DEBUG] Code inactive: {data.code}", flush=True)
            return {"success": False, "error": "兑换码已禁用"}
        if code.used_count >= code.total_uses:
            print(f"[DEBUG] Code exhausted: {data.code}, used={code.used_count}, total={code.total_uses}", flush=True)
            return {"success": False, "error": "兑换码已用完"}
        if code.expires_at and code.expires_at < datetime.utcnow():
            print(f"[DEBUG] Code expired: {data.code}", flush=True)
            return {"success": False, "error": "兑换码已过期"}

        print(f"[DEBUG] Code valid: {data.code}", flush=True)

        # 获取待验证的退伍军人
        veteran = db.query(Veteran).filter(
            Veteran.status == VerificationStatus.PENDING
        ).first()
        if not veteran:
            print("[DEBUG] No pending veterans found", flush=True)
            return {"success": False, "error": "没有待验证的退伍军人"}

        print(f"[DEBUG] Found veteran id={veteran.id}", flush=True)

        # 标记为处理中
        veteran.status = VerificationStatus.EMAIL_SENT
        db.commit()

        # 生成一次性验证 token
        token = secrets.token_urlsafe(32)
        verification_tokens[token] = {
            "veteran_id": veteran.id,
            "code_id": code.id,
            "created_at": datetime.utcnow()
        }

        # 清理过期 token（超过 1 小时）
        expired = [k for k, v in verification_tokens.items()
                   if (datetime.utcnow() - v["created_at"]).total_seconds() > 3600]
        for k in expired:
            del verification_tokens[k]

        print(f"[DEBUG] Returning success with token", flush=True)
        return {
            "success": True,
            "token": token,
            "veteran": {
                "first_name": veteran.first_name,
                "last_name": veteran.last_name,
                "birth_date": veteran.birth_date,
                "discharge_date": veteran.discharge_date,
                "org_id": veteran.org_id,
                "org_name": veteran.org_name,
                "veteran_id": veteran.id,
                "code_id": code.id
            }
        }
    except Exception as e:
        print(f"[ERROR] get-veteran exception: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {"success": False, "error": f"服务器错误: {str(e)}"}


@app.post("/api/verify/record-result")
def record_verification_result(data: RecordResultRequest, db: Session = Depends(get_db)):
    """记录前端直接验证的结果"""
    # 验证 token
    token_data = verification_tokens.get(data.token)
    if not token_data:
        return {"success": False, "error": "无效或过期的验证会话"}

    # 验证 token 对应的 veteran_id 和 code_id
    if token_data["veteran_id"] != data.veteran_id or token_data["code_id"] != data.code_id:
        return {"success": False, "error": "验证数据不匹配"}

    veteran = db.query(Veteran).filter(Veteran.id == data.veteran_id).first()
    code = db.query(RedeemCode).filter(RedeemCode.id == data.code_id).first()

    if not veteran or not code:
        return {"success": False, "error": "数据不存在"}

    if data.success:
        veteran.status = VerificationStatus.SUCCESS
        veteran.email_used = data.email
        veteran.verified_at = datetime.utcnow()
        code.used_count += 1

        usage = CodeUsage(
            code_id=code.id,
            veteran_id=veteran.id,
            email=data.email,
            verification_url="frontend-direct",
            status=VerificationStatus.SUCCESS,
            result_message="验证成功（前端直接调用）"
        )
        db.add(usage)
    else:
        veteran.status = VerificationStatus.PENDING  # 恢复为待验证
        veteran.error_message = "验证失败"

    # 使用后删除 token（一次性）
    del verification_tokens[data.token]

    db.commit()
    return {"success": True}


# ==================== Logs ====================

@app.get("/api/logs")
def get_logs(
    skip: int = 0,
    limit: int = 100,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    usages = db.query(CodeUsage).order_by(CodeUsage.id.desc()).offset(skip).limit(limit).all()
    return {"logs": usages}


# ==================== OAuth Settings (Admin) ====================

@app.get("/api/admin/oauth/settings")
def get_oauth_settings(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """获取 OAuth 设置"""
    settings = db.query(OAuthSettings).filter(OAuthSettings.provider == "linuxdo").first()
    if not settings:
        settings = OAuthSettings(provider="linuxdo")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "client_id": settings.client_id or "",
        "client_secret": "***" if settings.client_secret else "",
        "is_enabled": settings.is_enabled,
        "codes_per_user": settings.codes_per_user,
        "min_trust_level": settings.min_trust_level or 0
    }


@app.put("/api/admin/oauth/settings")
def update_oauth_settings(data: OAuthSettingsUpdate, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """更新 OAuth 设置"""
    settings = db.query(OAuthSettings).filter(OAuthSettings.provider == "linuxdo").first()
    if not settings:
        settings = OAuthSettings(provider="linuxdo")
        db.add(settings)

    if data.client_id is not None:
        settings.client_id = data.client_id
    if data.client_secret is not None and data.client_secret != "***":
        settings.client_secret = data.client_secret
    if data.is_enabled is not None:
        settings.is_enabled = data.is_enabled
    if data.codes_per_user is not None:
        settings.codes_per_user = data.codes_per_user
    if data.min_trust_level is not None:
        settings.min_trust_level = data.min_trust_level

    db.commit()
    return {"message": "设置已更新"}


# ==================== LinuxDO OAuth ====================

LINUXDO_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize"
LINUXDO_TOKEN_URL = "https://connect.linux.do/oauth2/token"
LINUXDO_USER_URL = "https://connect.linux.do/api/user"


@app.get("/api/oauth/linuxdo/status")
def get_linuxdo_oauth_status(db: Session = Depends(get_db)):
    """检查 LinuxDO OAuth 是否启用"""
    settings = db.query(OAuthSettings).filter(OAuthSettings.provider == "linuxdo").first()
    return {"enabled": settings.is_enabled if settings else False}


@app.get("/api/oauth/linuxdo/login")
def linuxdo_login(redirect_uri: str = Query(...), db: Session = Depends(get_db)):
    """重定向到 LinuxDO 授权页"""
    settings = db.query(OAuthSettings).filter(OAuthSettings.provider == "linuxdo").first()
    if not settings or not settings.is_enabled or not settings.client_id:
        raise HTTPException(status_code=400, detail="LinuxDO OAuth 未配置")

    state = secrets.token_urlsafe(16)
    auth_url = f"{LINUXDO_AUTHORIZE_URL}?client_id={settings.client_id}&response_type=code&redirect_uri={redirect_uri}&state={state}"
    return {"auth_url": auth_url, "state": state}


@app.post("/api/oauth/linuxdo/callback")
async def linuxdo_callback(code: str, redirect_uri: str, db: Session = Depends(get_db)):
    """处理 LinuxDO OAuth 回调"""
    settings = db.query(OAuthSettings).filter(OAuthSettings.provider == "linuxdo").first()
    if not settings or not settings.client_id or not settings.client_secret:
        raise HTTPException(status_code=400, detail="LinuxDO OAuth 未配置")

    # 获取 access_token (使用 HTTP Basic Auth)
    import base64
    credentials = base64.b64encode(f"{settings.client_id}:{settings.client_secret}".encode()).decode()

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            LINUXDO_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri
            }
        )

        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"获取 token 失败: {token_resp.text}")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        # 获取用户信息
        user_resp = await client.get(LINUXDO_USER_URL, headers={
            "Authorization": f"Bearer {access_token}"
        })

        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"获取用户信息失败: {user_resp.text}")

        user_data = user_resp.json()

    linuxdo_id = user_data.get("id")
    username = user_data.get("username")
    name = user_data.get("name")
    avatar_url = user_data.get("avatar_url")
    trust_level = user_data.get("trust_level", 0)

    # 检查信任等级
    min_level = settings.min_trust_level or 0
    if trust_level < min_level:
        raise HTTPException(status_code=403, detail=f"信任等级不足，需要 Lv.{min_level} 以上")

    # 查找或创建用户
    user = db.query(LinuxDOUser).filter(LinuxDOUser.linuxdo_id == linuxdo_id).first()
    is_new_user = False

    if not user:
        user = LinuxDOUser(
            linuxdo_id=linuxdo_id,
            username=username,
            name=name,
            avatar_url=avatar_url,
            trust_level=trust_level
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        is_new_user = True
    else:
        user.username = username
        user.name = name
        user.avatar_url = avatar_url
        user.trust_level = trust_level
        user.last_login = datetime.utcnow()
        db.commit()

    # 检查用户是否有可用兑换码，没有则生成
    usable_codes = db.query(RedeemCode).filter(
        RedeemCode.linuxdo_user_id == user.id,
        RedeemCode.is_active == True,
        RedeemCode.used_count < RedeemCode.total_uses
    ).first()

    if not usable_codes:
        codes_count = settings.codes_per_user or 2
        generated = []
        for _ in range(codes_count):
            code_str = secrets.token_urlsafe(8).upper()[:12]
            new_code = RedeemCode(
                code=code_str,
                total_uses=1,
                linuxdo_user_id=user.id
            )
            db.add(new_code)
            generated.append(new_code)
        db.commit()

    user_codes = db.query(RedeemCode).filter(RedeemCode.linuxdo_user_id == user.id).all()

    return {
        "user": {
            "id": user.id,
            "linuxdo_id": user.linuxdo_id,
            "username": user.username,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "trust_level": user.trust_level
        },
        "codes": [{"code": c.code, "used_count": c.used_count, "total_uses": c.total_uses, "is_active": c.is_active} for c in user_codes],
        "is_new_user": is_new_user
    }


@app.get("/api/oauth/linuxdo/users")
def list_linuxdo_users(
    skip: int = 0,
    limit: int = 50,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """列出所有 LinuxDO 用户"""
    users = db.query(LinuxDOUser).order_by(LinuxDOUser.id.desc()).offset(skip).limit(limit).all()
    total = db.query(LinuxDOUser).count()

    result = []
    for user in users:
        codes = db.query(RedeemCode).filter(RedeemCode.linuxdo_user_id == user.id).all()
        result.append({
            "id": user.id,
            "linuxdo_id": user.linuxdo_id,
            "username": user.username,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "trust_level": user.trust_level,
            "created_at": user.created_at,
            "last_login": user.last_login,
            "codes": [{"code": c.code, "used_count": c.used_count, "total_uses": c.total_uses, "is_active": c.is_active} for c in codes]
        })

    return {"users": result, "total": total}


# ==================== Proxy Settings (Admin) ====================

@app.get("/api/admin/proxy/settings")
def get_proxy_settings(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """获取代理设置"""
    settings = db.query(ProxySettings).first()
    if not settings:
        settings = ProxySettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "is_enabled": settings.is_enabled,
        "proxy_type": settings.proxy_type or "socks5",
        "host": settings.host or "",
        "port": settings.port or 0,
        "username": settings.username or "",
        "password": "***" if settings.password else "",
    }


@app.put("/api/admin/proxy/settings")
def update_proxy_settings(data: ProxySettingsUpdate, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """更新代理设置"""
    settings = db.query(ProxySettings).first()
    if not settings:
        settings = ProxySettings()
        db.add(settings)

    if data.is_enabled is not None:
        settings.is_enabled = data.is_enabled
    if data.proxy_type is not None:
        settings.proxy_type = data.proxy_type
    if data.host is not None:
        settings.host = data.host
    if data.port is not None:
        settings.port = data.port
    if data.username is not None:
        settings.username = data.username
    if data.password is not None and data.password != "***":
        settings.password = data.password

    db.commit()
    return {"message": "代理设置已更新"}


@app.post("/api/admin/proxy/test")
def test_proxy(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """测试代理连接"""
    import subprocess
    settings = db.query(ProxySettings).first()
    if not settings or not settings.is_enabled:
        return {"success": False, "error": "代理未启用"}

    if not settings.host or not settings.port:
        return {"success": False, "error": "代理配置不完整"}

    try:
        cmd = ["curl", "-s", "--connect-timeout", "10"]
        if settings.proxy_type == "socks5":
            cmd.extend(["--socks5", f"{settings.host}:{settings.port}"])
            if settings.username and settings.password:
                cmd.extend(["--proxy-user", f"{settings.username}:{settings.password}"])
        else:
            proxy_url = f"http://{settings.host}:{settings.port}"
            if settings.username and settings.password:
                proxy_url = f"http://{settings.username}:{settings.password}@{settings.host}:{settings.port}"
            cmd.extend(["-x", proxy_url])

        cmd.append("http://ipinfo.io")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

        if result.returncode == 0 and result.stdout:
            import json
            data = json.loads(result.stdout)
            return {
                "success": True,
                "ip": data.get("ip"),
                "city": data.get("city"),
                "region": data.get("region"),
                "country": data.get("country"),
                "org": data.get("org"),
            }
        return {"success": False, "error": f"连接失败: {result.stderr or 'Unknown error'}"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "连接超时"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ==================== Startup ====================

@app.get("/api/proxy/status")
def proxy_status():
    """获取代理配置状态"""
    return get_proxy_status()


@app.on_event("startup")
def startup():
    import logging
    logger = logging.getLogger(__name__)
    try:
        logger.info("Starting application...")
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.exception(f"Failed to initialize database: {e}")
        raise


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=14100)
