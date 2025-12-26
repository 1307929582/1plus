#!/usr/bin/env python3
"""
SheerID Veteran Verification Tool
帮助残疾退伍军人自动填写 SheerID 认证表单
"""

import csv
import hashlib
import re
import time
import requests
from typing import Optional
from dataclasses import dataclass


@dataclass
class Veteran:
    first_name: str
    last_name: str
    birth_date: str
    discharge_date: str
    org_id: int
    org_name: str


MILITARY_BRANCHES = {
    "Air Force": 4073,
    "Army": 4074,
    "Navy": 4075,
    "Marines": 4076,
    "Marine Corps": 4076,
    "Coast Guard": 4077,
    "Space Force": 4078,
    "National Guard": 4079,
}

SHEERID_BASE_URL = "https://services.sheerid.com"
HEADERS = {
    "accept": "application/json",
    "content-type": "application/json",
    "clientname": "jslib",
    "clientversion": "2.157.0",
}


def extract_verification_id(url: str) -> Optional[str]:
    patterns = [
        r"verificationId=([a-f0-9]+)",
        r"/verification/([a-f0-9]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def generate_fingerprint() -> str:
    timestamp = str(int(time.time() * 1000))
    return hashlib.md5(timestamp.encode()).hexdigest()


def submit_military_status(verification_id: str, session: requests.Session) -> dict:
    url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectMilitaryStatus"
    payload = {"status": "VETERAN"}
    response = session.post(url, headers=HEADERS, json=payload)
    response.raise_for_status()
    return response.json()


def submit_personal_info(
    verification_id: str,
    veteran: Veteran,
    email: str,
    referer_url: str,
    session: requests.Session
) -> dict:
    url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectInactiveMilitaryPersonalInfo"

    payload = {
        "firstName": veteran.first_name,
        "lastName": veteran.last_name,
        "birthDate": veteran.birth_date,
        "dischargeDate": veteran.discharge_date,
        "email": email,
        "phoneNumber": "",
        "country": "US",
        "locale": "en-US",
        "organization": {
            "id": veteran.org_id,
            "name": veteran.org_name
        },
        "deviceFingerprintHash": generate_fingerprint(),
        "metadata": {
            "marketConsentValue": False,
            "refererUrl": referer_url,
        }
    }

    response = session.post(url, headers=HEADERS, json=payload)
    response.raise_for_status()
    return response.json()


def verify_veteran(url: str, veteran: Veteran, email: str) -> dict:
    verification_id = extract_verification_id(url)
    if not verification_id:
        raise ValueError(f"无法从 URL 提取 verificationId: {url}")

    session = requests.Session()
    submit_military_status(verification_id, session)
    result = submit_personal_info(verification_id, veteran, email, url, session)
    return result


def load_veterans_from_csv(filepath: str) -> list[Veteran]:
    veterans = []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            org_name = row.get("org_name", "Air Force")
            org_id = int(row.get("org_id") or MILITARY_BRANCHES.get(org_name, 4073))

            veteran = Veteran(
                first_name=row["first_name"],
                last_name=row["last_name"],
                birth_date=row["birth_date"],
                discharge_date=row["discharge_date"],
                org_id=org_id,
                org_name=org_name,
            )
            veterans.append(veteran)
    return veterans


class VeteranVerificationTool:
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.veterans = load_veterans_from_csv(csv_path)
        self.current_index = 0

    def get_current_veteran(self) -> Optional[Veteran]:
        if self.current_index >= len(self.veterans):
            return None
        return self.veterans[self.current_index]

    def verify_current(self, url: str, email: str) -> str:
        veteran = self.get_current_veteran()
        if not veteran:
            return "❌ 没有更多待验证的退伍军人"

        try:
            result = verify_veteran(url, veteran, email)
            self.current_index += 1

            current_step = result.get('currentStep', 'unknown')
            current_state = result.get('currentState', 'unknown')

            if current_step == 'emailLoop':
                return f"✅ 提交成功！请检查邮箱 {email} 完成验证\n\n已处理: {self.current_index}/{len(self.veterans)}"
            else:
                return f"✅ 提交成功\n状态: {current_state}\n下一步: {current_step}\n\n已处理: {self.current_index}/{len(self.veterans)}"

        except requests.exceptions.HTTPError as e:
            return f"❌ API 错误: {e.response.status_code} - {e.response.text}"
        except Exception as e:
            return f"❌ 验证失败: {str(e)}"

    def remaining_count(self) -> int:
        return len(self.veterans) - self.current_index

    def get_status(self) -> str:
        return f"待处理: {self.remaining_count()} / 总计: {len(self.veterans)}"
