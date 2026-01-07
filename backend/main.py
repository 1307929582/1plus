"""
FastAPI 主应用 - 简化版（使用模拟数据）
"""
import hashlib
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, init_db
from models import Admin, MockDataCounter, VerificationHistory, ProxySettings, CaptchaSettings
from proxy_config import get_proxy_status
from public_api import router as public_router
from verification_services import configure_services
from job_manager import get_job_manager

app = FastAPI(title="SheerID Veteran Verification API", version="3.0.0")

app.include_router(public_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()


# ==================== 模拟数据配置 ====================

MOCK_VETERAN_DATA = {
    "first_name": "PAUL",
    "birth_date": "1988-02-22",
    "discharge_date": "2025-08-12",
    "org_id": 4070,
    "org_name": "Army",
}


def get_mock_veteran_data(db: Session) -> dict:
    """获取模拟退伍军人数据，每次调用 last_name 增加一个 SUNG"""
    counter = db.query(MockDataCounter).first()
    if not counter:
        counter = MockDataCounter(counter=1)
        db.add(counter)
        db.commit()
        db.refresh(counter)

    # 生成 last_name: "SUNG SUNG ... SUNG JEONG"
    sung_count = counter.counter
    last_name = " ".join(["SUNG"] * sung_count) + " JEONG"

    # 增加计数器
    counter.counter += 1
    db.commit()

    return {
        **MOCK_VETERAN_DATA,
        "last_name": last_name,
    }


# ==================== Pydantic Models ====================

class AdminLogin(BaseModel):
    username: str
    password: str


class AdminCreate(BaseModel):
    username: str
    password: str


class DashboardStats(BaseModel):
    total_verifications: int
    success_count: int
    failed_count: int
    current_counter: int


class ProxySettingsUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    proxy_type: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None


class CaptchaSettingsUpdate(BaseModel):
    turnstile_site_key: Optional[str] = None
    turnstile_secret: Optional[str] = None
    hcaptcha_site_key: Optional[str] = None
    hcaptcha_secret: Optional[str] = None
    is_enabled: Optional[bool] = None


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
    exists = db.query(Admin).first() is not None
    return {"exists": exists}


@app.post("/api/admin/init")
def init_admin(data: AdminCreate, db: Session = Depends(get_db)):
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
    counter = db.query(MockDataCounter).first()
    current_counter = counter.counter if counter else 1

    total = db.query(VerificationHistory).count()
    success = db.query(VerificationHistory).filter(VerificationHistory.success == True).count()
    failed = db.query(VerificationHistory).filter(VerificationHistory.success == False).count()

    return DashboardStats(
        total_verifications=total,
        success_count=success,
        failed_count=failed,
        current_counter=current_counter,
    )


# ==================== 验证历史 ====================

@app.get("/api/history")
def get_history(
    skip: int = 0,
    limit: int = 50,
    admin: Admin = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """获取验证历史"""
    history = db.query(VerificationHistory).order_by(VerificationHistory.id.desc()).offset(skip).limit(limit).all()
    total = db.query(VerificationHistory).count()
    return {"history": history, "total": total}


@app.post("/api/counter/reset")
def reset_counter(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """重置计数器"""
    counter = db.query(MockDataCounter).first()
    if counter:
        counter.counter = 1
        db.commit()
    return {"message": "计数器已重置", "counter": 1}


@app.post("/api/counter/set")
def set_counter(value: int, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """设置计数器值"""
    if value < 1:
        raise HTTPException(status_code=400, detail="计数器值必须大于等于 1")
    counter = db.query(MockDataCounter).first()
    if not counter:
        counter = MockDataCounter(counter=value)
        db.add(counter)
    else:
        counter.counter = value
    db.commit()
    return {"message": f"计数器已设置为 {value}", "counter": value}


@app.get("/api/counter")
def get_counter(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    """获取当前计数器值"""
    counter = db.query(MockDataCounter).first()
    return {"counter": counter.counter if counter else 1}


# ==================== 获取模拟数据（供前端验证使用） ====================

@app.get("/api/mock-veteran")
def get_mock_veteran(db: Session = Depends(get_db)):
    """获取下一个模拟退伍军人数据"""
    data = get_mock_veteran_data(db)
    return {"success": True, "veteran": data}


@app.post("/api/record-verification")
def record_verification(
    first_name: str,
    last_name: str,
    birth_date: str,
    discharge_date: str,
    org_id: int,
    org_name: str,
    email: str,
    success: bool,
    error_message: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """记录验证结果"""
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
    return {"success": True}


# ==================== Proxy Settings (Admin) ====================

@app.get("/api/admin/proxy/settings")
def get_proxy_settings(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
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


# ==================== Captcha Settings (Admin) ====================

@app.get("/api/admin/captcha/settings")
def get_captcha_settings(admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    settings = db.query(CaptchaSettings).first()
    if not settings:
        settings = CaptchaSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "turnstile_site_key": settings.turnstile_site_key or "",
        "turnstile_secret": "***" if settings.turnstile_secret else "",
        "hcaptcha_site_key": settings.hcaptcha_site_key or "",
        "hcaptcha_secret": "***" if settings.hcaptcha_secret else "",
        "is_enabled": settings.is_enabled,
    }


@app.put("/api/admin/captcha/settings")
def update_captcha_settings(data: CaptchaSettingsUpdate, admin: Admin = Depends(verify_admin), db: Session = Depends(get_db)):
    from captcha_service import configure_captcha

    settings = db.query(CaptchaSettings).first()
    if not settings:
        settings = CaptchaSettings()
        db.add(settings)

    if data.turnstile_site_key is not None:
        settings.turnstile_site_key = data.turnstile_site_key
    if data.turnstile_secret is not None and data.turnstile_secret != "***":
        settings.turnstile_secret = data.turnstile_secret
    if data.hcaptcha_site_key is not None:
        settings.hcaptcha_site_key = data.hcaptcha_site_key
    if data.hcaptcha_secret is not None and data.hcaptcha_secret != "***":
        settings.hcaptcha_secret = data.hcaptcha_secret
    if data.is_enabled is not None:
        settings.is_enabled = data.is_enabled

    db.commit()

    configure_captcha(
        turnstile_secret=settings.turnstile_secret or "",
        hcaptcha_secret=settings.hcaptcha_secret or ""
    )

    return {"message": "Captcha 设置已更新"}


@app.get("/api/public/captcha/config")
def get_captcha_public_config(db: Session = Depends(get_db)):
    settings = db.query(CaptchaSettings).first()
    if not settings or not settings.is_enabled:
        return {
            "enabled": False,
            "turnstile_site_key": "",
            "hcaptcha_site_key": "",
        }
    return {
        "enabled": True,
        "turnstile_site_key": settings.turnstile_site_key or "",
        "hcaptcha_site_key": settings.hcaptcha_site_key or "",
    }


# ==================== Startup ====================

@app.get("/api/proxy/status")
def proxy_status():
    return get_proxy_status()


@app.on_event("startup")
def startup():
    import logging
    import os
    logger = logging.getLogger(__name__)
    try:
        logger.info("Starting application...")
        init_db()
        logger.info("Database initialized successfully")

        veteran_mode = os.getenv("VETERAN_DATA_MODE", "mock")
        sheerid_mode = os.getenv("SHEERID_MODE", "real")

        from database import SessionLocal
        configure_services(
            veteran_mode=veteran_mode,
            sheerid_mode=sheerid_mode,
            db_session_factory=SessionLocal,
        )
        logger.info(f"Services configured: veteran={veteran_mode}, sheerid={sheerid_mode}")

        from captcha_service import configure_captcha
        db = SessionLocal()
        try:
            captcha_settings = db.query(CaptchaSettings).first()
            if captcha_settings:
                configure_captcha(
                    turnstile_secret=captcha_settings.turnstile_secret or "",
                    hcaptcha_secret=captcha_settings.hcaptcha_secret or ""
                )
                logger.info(f"Captcha configured: enabled={captcha_settings.is_enabled}")
        finally:
            db.close()

        job_manager = get_job_manager()

    except Exception as e:
        logger.exception(f"Failed to initialize: {e}")
        raise


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=14100)
