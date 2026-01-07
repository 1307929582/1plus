"""
Captcha 验证服务 - Cloudflare Turnstile + hCaptcha
"""
import os
import httpx
import logging
from typing import Optional
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# 从环境变量读取（优先）或通过 configure_captcha() 配置
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")
HCAPTCHA_SECRET = os.getenv("HCAPTCHA_SECRET", "")

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify"


async def verify_turnstile(token: str, remote_ip: Optional[str] = None) -> bool:
    """验证 Cloudflare Turnstile token"""
    if not TURNSTILE_SECRET:
        logger.warning("Turnstile secret not configured, skipping verification")
        return True

    try:
        async with httpx.AsyncClient() as client:
            data = {
                "secret": TURNSTILE_SECRET,
                "response": token,
            }
            if remote_ip:
                data["remoteip"] = remote_ip

            resp = await client.post(TURNSTILE_VERIFY_URL, data=data, timeout=10)
            result = resp.json()
            logger.info(f"Turnstile verify result: {result}")
            return result.get("success", False)
    except Exception as e:
        logger.error(f"Turnstile verification error: {e}")
        return False


async def verify_hcaptcha(token: str, remote_ip: Optional[str] = None) -> bool:
    """验证 hCaptcha token"""
    if not HCAPTCHA_SECRET:
        logger.warning("hCaptcha secret not configured, skipping verification")
        return True

    try:
        async with httpx.AsyncClient() as client:
            data = {
                "secret": HCAPTCHA_SECRET,
                "response": token,
            }
            if remote_ip:
                data["remoteip"] = remote_ip

            resp = await client.post(HCAPTCHA_VERIFY_URL, data=data, timeout=10)
            result = resp.json()
            logger.info(f"hCaptcha verify result: {result}")
            return result.get("success", False)
    except Exception as e:
        logger.error(f"hCaptcha verification error: {e}")
        return False


async def verify_captchas(
    turnstile_token: Optional[str] = None,
    hcaptcha_token: Optional[str] = None,
    remote_ip: Optional[str] = None,
    require_both: bool = False
) -> None:
    """
    验证 captcha tokens

    Args:
        turnstile_token: Cloudflare Turnstile token
        hcaptcha_token: hCaptcha token
        remote_ip: 客户端 IP
        require_both: 是否要求两个都通过

    Raises:
        HTTPException: 验证失败时抛出
    """
    results = []

    if turnstile_token:
        t_ok = await verify_turnstile(turnstile_token, remote_ip)
        results.append(("turnstile", t_ok))

    if hcaptcha_token:
        h_ok = await verify_hcaptcha(hcaptcha_token, remote_ip)
        results.append(("hcaptcha", h_ok))

    if not results:
        raise HTTPException(status_code=400, detail="至少需要一个 captcha token")

    if require_both:
        if not all(ok for _, ok in results):
            failed = [name for name, ok in results if not ok]
            raise HTTPException(status_code=400, detail=f"Captcha 验证失败: {', '.join(failed)}")
    else:
        if not any(ok for _, ok in results):
            raise HTTPException(status_code=400, detail="Captcha 验证失败")


def configure_captcha(turnstile_secret: str = "", hcaptcha_secret: str = ""):
    """配置 captcha secrets"""
    global TURNSTILE_SECRET, HCAPTCHA_SECRET
    TURNSTILE_SECRET = turnstile_secret
    HCAPTCHA_SECRET = hcaptcha_secret
