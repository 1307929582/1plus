"""
代理配置模块 - 支持 SOCKS5 代理
"""
import os
import requests

PROXY_URL = os.getenv("PROXY_URL", "")


def build_session() -> requests.Session:
    """构建带代理的 requests session"""
    session = requests.Session()

    if PROXY_URL and PROXY_URL.lower() != "direct":
        session.proxies = {
            "http": PROXY_URL,
            "https": PROXY_URL,
        }

    return session


def get_proxy_status() -> dict:
    """获取代理配置状态"""
    if not PROXY_URL or PROXY_URL.lower() == "direct":
        return {"enabled": False, "mode": "direct", "url": None}

    masked = PROXY_URL
    if "@" in PROXY_URL:
        parts = PROXY_URL.split("@")
        masked = f"***@{parts[-1]}"

    return {"enabled": True, "mode": "proxy", "url": masked}
