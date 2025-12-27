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
from models import Base, Veteran, RedeemCode, CodeUsage, Admin, VerificationLog, VerificationStatus, LinuxDOUser, OAuthSettings
from sheerid_service import verify_veteran

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
        email=data.email
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
        "codes_per_user": settings.codes_per_user
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

    # 检查用户是否有兑换码，没有则生成
    user_codes = db.query(RedeemCode).filter(RedeemCode.linuxdo_user_id == user.id).all()
    if not user_codes:
        codes_count = settings.codes_per_user or 2
        for _ in range(codes_count):
            code_str = secrets.token_urlsafe(8).upper()[:12]
            new_code = RedeemCode(
                code=code_str,
                total_uses=1,
                linuxdo_user_id=user.id
            )
            db.add(new_code)
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
    return {"users": users, "total": total}


# ==================== Startup ====================

@app.on_event("startup")
def startup():
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=14100)
