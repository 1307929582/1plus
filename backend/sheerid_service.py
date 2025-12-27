"""
SheerID 验证服务
"""
import hashlib
import random
import time
import uuid
from typing import Optional
import requests

from proxy_config import build_session

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


def generate_fingerprint() -> str:
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
    email: str
) -> dict:
    """执行退伍军人验证"""
    verification_id = extract_verification_id(url)
    if not verification_id:
        return {"success": False, "error": "无法从 URL 提取 verificationId"}

    session = build_session()
    headers = get_headers(url)

    try:
        # Step 1: 提交军人状态
        status_url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectMilitaryStatus"
        r1 = session.post(status_url, headers=headers, json={"status": "VETERAN"})
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
            "deviceFingerprintHash": generate_fingerprint(),
            "metadata": {"marketConsentValue": False, "refererUrl": url}
        }

        r2 = session.post(info_url, headers=headers, json=payload)
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
