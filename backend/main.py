"""
FastAPI 主应用
"""
import csv
import io
import secrets
import hashlib
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db, init_db
from models import Base, Veteran, Admin, VerificationStatus, ProxySettings, CaptchaSettings
from proxy_config import get_proxy_status
from public_api import router as public_router
from verification_services import configure_services
from job_manager import get_job_manager

app = FastAPI(title="SheerID Veteran Verification API", version="2.0.0")

app.include_router(public_router)

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


class DashboardStats(BaseModel):
    total_veterans: int
    pending_veterans: int
    verified_veterans: int
    failed_veterans: int


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
    stats = DashboardStats(
        total_veterans=db.query(Veteran).count(),
        pending_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.PENDING).count(),
        verified_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.SUCCESS).count(),
        failed_veterans=db.query(Veteran).filter(Veteran.status == VerificationStatus.FAILED).count(),
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
    """从 CSV 导入退伍军人数据（分批处理）"""
    import re
    from datetime import datetime as dt

    def normalize_date(date_str: str) -> str:
        date_str = date_str.strip()
        if not date_str:
            return ""
        formats = [
            "%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y", "%d-%m-%Y",
        ]
        for fmt in formats:
            try:
                parsed = dt.strptime(date_str, fmt)
                return parsed.strftime("%Y-%m-%d")
            except ValueError:
                continue
        nums = re.findall(r'\d+', date_str)
        if len(nums) == 3:
            y, m, d = nums[0], nums[1], nums[2]
            if len(y) == 4:
                return f"{y}-{int(m):02d}-{int(d):02d}"
        return date_str

    BATCH_SIZE = 500
    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))

    count = 0
    skipped = 0
    batch = []

    for row in reader:
        first_name = row.get("first_name", "").strip()
        last_name = row.get("last_name", "").strip()
        birth_date = normalize_date(row.get("birth_date", ""))
        discharge_date = normalize_date(row.get("discharge_date", ""))

        if not first_name or not last_name or not birth_date or not discharge_date:
            skipped += 1
            continue

        org_id_val = row.get("org_id", "").strip()
        org_name_val = row.get("org_name", "").strip()
        veteran = Veteran(
            first_name=first_name,
            last_name=last_name,
            birth_date=birth_date,
            discharge_date=discharge_date,
            org_id=int(org_id_val) if org_id_val else 4070,
            org_name=org_name_val if org_name_val else "Army",
        )
        batch.append(veteran)
        count += 1

        if len(batch) >= BATCH_SIZE:
            db.bulk_save_objects(batch)
            db.commit()
            batch = []

    if batch:
        db.bulk_save_objects(batch)
        db.commit()

    msg = f"成功导入 {count} 条记录"
    if skipped > 0:
        msg += f"，跳过 {skipped} 条空行"
    return {"message": msg}


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
    deleted = db.query(Veteran).filter(Veteran.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"已删除 {deleted} 条记录"}


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
        sheerid_mode = os.getenv("SHEERID_MODE", "mock")

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
