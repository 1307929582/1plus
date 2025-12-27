"""
SheerID 验证服务
"""
import hashlib
import logging
import random
import time
import uuid
from typing import Optional, Tuple
import requests

from proxy_config import build_session

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

SHEERID_BASE_URL = "https://services.sheerid.com"

MILITARY_BRANCHES = {
    "Air Force": 4073,
    "Army": 4070,
    "Navy": 4075,
    "Marines": 4076,
    "Marine Corps": 4076,
    "Coast Guard": 4077,
    "Space Force": 4078,
    "National Guard": 4079,
}


def get_headers(referer_url: str) -> dict:
    return {
        "accept": "application/json",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        "clientname": "jslib",
        "clientversion": "2.157.0",
        "origin": "https://services.sheerid.com",
        "referer": referer_url,
        "user-agent": f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.randint(110, 130)}.0.0.0 Safari/537.36",
    }


def get_udid(session: requests.Session) -> str:
    """从 SheerID 指纹服务获取真实 UDID"""
    try:
        resp = session.get(
            "https://fn.us.fd.sheerid.com/udid/udid.json",
            headers={
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            timeout=10
        )
        logger.info(f"UDID response: {resp.status_code} - {resp.text[:200]}")
        if resp.status_code == 200:
            data = resp.json()
            udid = str(data.get("udid", ""))
            logger.info(f"Got UDID: {udid}")
            return udid
    except Exception as e:
        logger.error(f"UDID fetch error: {e}")
    return ""


def generate_fingerprint() -> str:
    """备用: 生成随机指纹 (仅当 UDID 获取失败时使用)"""
    random_data = f"{uuid.uuid4()}-{time.time()}-{random.random()}"
    return hashlib.md5(random_data.encode()).hexdigest()


def extract_verification_id(url: str) -> Optional[str]:
    import re
    patterns = [
        r"verificationId=([a-f0-9]+)",
        r"/verification/([a-f0-9]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def verify_veteran(
    url: str,
    first_name: str,
    last_name: str,
    birth_date: str,
    discharge_date: str,
    org_id: int,
    org_name: str,
    email: str,
    client_udid: Optional[str] = None
) -> dict:
    """执行退伍军人验证"""
    verification_id = extract_verification_id(url)
    if not verification_id:
        return {"success": False, "error": "无法从 URL 提取 verificationId"}

    session = build_session()
    headers = get_headers(url)

    try:
        # Step 0: 使用客户端 UDID（优先）或获取服务器 UDID
        if client_udid:
            fingerprint = client_udid
            logger.info(f"Using client UDID: {fingerprint}")
        else:
            udid = get_udid(session)
            fingerprint = udid if udid else generate_fingerprint()
            logger.info(f"Using server fingerprint: {fingerprint}")

        # Step 1: 提交军人状态
        status_url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectMilitaryStatus"
        r1 = session.post(status_url, headers=headers, json={"status": "VETERAN"})
        logger.info(f"Step 1 response: {r1.status_code} - {r1.text[:500]}")
        r1.raise_for_status()

        # Step 2: 提交个人信息
        info_url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectInactiveMilitaryPersonalInfo"
        payload = {
            "firstName": first_name,
            "lastName": last_name,
            "birthDate": birth_date,
            "dischargeDate": discharge_date,
            "email": email,
            "phoneNumber": "",
            "country": "US",
            "locale": "en-US",
            "organization": {"id": org_id, "name": org_name},
            "deviceFingerprintHash": fingerprint,
            "metadata": {"marketConsentValue": False, "refererUrl": url}
        }
        logger.info(f"Step 2 payload: {payload}")

        r2 = session.post(info_url, headers=headers, json=payload)
        logger.info(f"Step 2 response: {r2.status_code} - {r2.text}")
        r2.raise_for_status()
        result = r2.json()

        current_step = result.get("currentStep", "unknown")
        if current_step == "emailLoop":
            return {"success": True, "step": "emailLoop", "message": "请检查邮箱完成验证"}
        elif current_step == "error":
            return {"success": False, "step": "error", "error": result.get("systemErrorMessage", "验证失败")}
        else:
            return {"success": True, "step": current_step, "message": f"状态: {current_step}"}

    except requests.exceptions.HTTPError as e:
        return {"success": False, "error": f"API 错误: {e.response.status_code} - {e.response.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def verify_veteran_step1(
    url: str,
    first_name: str,
    last_name: str,
    birth_date: str,
    discharge_date: str,
    org_id: int,
    org_name: str,
    email: str,
    client_udid: Optional[str] = None
) -> dict:
    """第一步：提交验证，返回 fingerprint 供后续使用"""
    verification_id = extract_verification_id(url)
    if not verification_id:
        return {"success": False, "error": "无法从 URL 提取 verificationId"}

    session = build_session()
    headers = get_headers(url)

    try:
        # 优先使用客户端 UDID，否则获取服务器 UDID
        if client_udid:
            fingerprint = client_udid
            logger.info(f"Step1 using client UDID: {fingerprint}")
        else:
            udid = get_udid(session)
            fingerprint = udid if udid else generate_fingerprint()
            logger.info(f"Step1 using server fingerprint: {fingerprint}")

        # Step 1: 提交军人状态
        status_url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectMilitaryStatus"
        r1 = session.post(status_url, headers=headers, json={"status": "VETERAN"})
        logger.info(f"Step 1 response: {r1.status_code} - {r1.text[:500]}")
        r1.raise_for_status()

        # Step 2: 提交个人信息
        info_url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectInactiveMilitaryPersonalInfo"
        payload = {
            "firstName": first_name,
            "lastName": last_name,
            "birthDate": birth_date,
            "dischargeDate": discharge_date,
            "email": email,
            "phoneNumber": "",
            "country": "US",
            "locale": "en-US",
            "organization": {"id": org_id, "name": org_name},
            "deviceFingerprintHash": fingerprint,
            "metadata": {"marketConsentValue": False, "refererUrl": url}
        }

        r2 = session.post(info_url, headers=headers, json=payload)
        logger.info(f"Step 2 response: {r2.status_code} - {r2.text}")
        r2.raise_for_status()
        result = r2.json()

        current_step = result.get("currentStep", "unknown")
        if current_step == "emailLoop":
            return {
                "success": True,
                "step": "emailLoop",
                "verification_id": verification_id,
                "fingerprint": fingerprint,
                "message": "请检查邮箱，复制验证链接中的 token"
            }
        elif current_step == "error":
            return {"success": False, "step": "error", "error": result.get("systemErrorMessage", "验证失败")}
        elif current_step == "success":
            return {"success": True, "step": "success", "message": "验证成功！"}
        else:
            return {"success": True, "step": current_step, "message": f"状态: {current_step}"}

    except requests.exceptions.HTTPError as e:
        return {"success": False, "error": f"API 错误: {e.response.status_code} - {e.response.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def complete_email_loop(verification_id: str, email_token: str, fingerprint: str) -> dict:
    """第二步：用邮件 token 完成验证"""
    session = build_session()
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "clientname": "jslib",
        "clientversion": "2.157.0",
    }

    try:
        url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/emailLoop"
        payload = {
            "emailToken": email_token,
            "deviceFingerprintHash": fingerprint
        }
        logger.info(f"EmailLoop payload: {payload}")

        resp = session.post(url, headers=headers, json=payload)
        logger.info(f"EmailLoop response: {resp.status_code} - {resp.text}")
        result = resp.json()

        current_step = result.get("currentStep", "unknown")
        if current_step == "success":
            return {"success": True, "step": "success", "message": "验证成功！"}
        elif current_step == "error":
            error_ids = result.get("errorIds", [])
            if "invalidEmailLoopToken" in error_ids:
                return {"success": False, "error": "Token 无效，请检查是否正确"}
            elif "expiredEmailLoopToken" in error_ids:
                return {"success": False, "error": "Token 已过期，请重新验证"}
            return {"success": False, "error": result.get("systemErrorMessage", "验证失败")}
        else:
            return {"success": True, "step": current_step, "message": f"状态: {current_step}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


def extract_token_from_url(url: str) -> Optional[str]:
    """从邮件链接中提取 token"""
    import re
    # 常见格式: ?emailToken=123456 或 &emailToken=123456
    patterns = [
        r"[?&]emailToken=(\d+)",
        r"[?&]token=(\d+)",
        r"/token/(\d+)",
        r"[?&]t=(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    # 如果是纯数字，直接返回
    if url.strip().isdigit():
        return url.strip()
    return None
