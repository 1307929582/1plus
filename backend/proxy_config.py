"""
代理配置模块 - 从数据库读取配置
"""
import requests
from database import SessionLocal
from models import ProxySettings


def get_proxy_settings():
    """从数据库获取代理设置"""
    db = SessionLocal()
    try:
        settings = db.query(ProxySettings).first()
        if not settings:
            return None
        return {
            "is_enabled": settings.is_enabled,
            "proxy_type": settings.proxy_type,
            "host": settings.host,
            "port": settings.port,
            "username": settings.username,
            "password": settings.password,
        }
    finally:
        db.close()


def build_proxy_url(settings: dict) -> str:
    """构建代理 URL"""
    if not settings or not settings.get("is_enabled"):
        return ""

    host = settings.get("host")
    port = settings.get("port")
    if not host or not port:
        return ""

    proxy_type = settings.get("proxy_type", "socks5")
    # socks5h = 让代理服务器解析 DNS，解决 HTTPS 连接问题
    if proxy_type == "socks5":
        proxy_type = "socks5h"

    username = settings.get("username")
    password = settings.get("password")

    if username and password:
        return f"{proxy_type}://{username}:{password}@{host}:{port}"
    return f"{proxy_type}://{host}:{port}"


def build_session() -> requests.Session:
    """构建带代理的 requests session"""
    session = requests.Session()

    settings = get_proxy_settings()
    proxy_url = build_proxy_url(settings)

    if proxy_url:
        session.proxies = {
            "http": proxy_url,
            "https": proxy_url,
        }

    return session


def get_proxy_status() -> dict:
    """获取代理配置状态"""
    settings = get_proxy_settings()

    if not settings or not settings.get("is_enabled"):
        return {"enabled": False, "mode": "direct", "url": None}

    proxy_url = build_proxy_url(settings)
    masked = proxy_url
    if "@" in proxy_url:
        parts = proxy_url.split("@")
        masked = f"***@{parts[-1]}"

    return {"enabled": True, "mode": "proxy", "url": masked}
