#!/usr/bin/env python3
"""
SheerID Veteran Verification - Web UI
"""

import csv
import hashlib
import re
import time
import random
import string
import uuid
import requests
from dataclasses import dataclass
from typing import Optional
import gradio as gr


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
    "Army": 4070,
    "Navy": 4075,
    "Marines": 4076,
    "Marine Corps": 4076,
    "Coast Guard": 4077,
    "Space Force": 4078,
    "National Guard": 4079,
}

SHEERID_BASE_URL = "https://services.sheerid.com"


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

CSV_PATH = "veterans.csv"
PROGRESS_FILE = "progress.txt"


def load_progress() -> int:
    try:
        with open(PROGRESS_FILE, 'r') as f:
            return int(f.read().strip())
    except:
        return 0


def save_progress(index: int):
    with open(PROGRESS_FILE, 'w') as f:
        f.write(str(index))


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
    # 随机生成设备指纹
    random_data = f"{uuid.uuid4()}-{time.time()}-{random.random()}"
    return hashlib.md5(random_data.encode()).hexdigest()


def submit_military_status(verification_id: str, referer_url: str, session: requests.Session) -> dict:
    url = f"{SHEERID_BASE_URL}/rest/v2/verification/{verification_id}/step/collectMilitaryStatus"
    payload = {"status": "VETERAN"}
    response = session.post(url, headers=get_headers(referer_url), json=payload)
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

    response = session.post(url, headers=get_headers(referer_url), json=payload)
    response.raise_for_status()
    return response.json()


class VeteranVerificationTool:
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.veterans = load_veterans_from_csv(csv_path)
        self.current_index = load_progress()  # 从文件加载进度

    def get_current_veteran(self) -> Optional[Veteran]:
        if self.current_index >= len(self.veterans):
            return None
        return self.veterans[self.current_index]

    def verify_current(self, url: str, email: str) -> str:
        veteran = self.get_current_veteran()
        if not veteran:
            return "没有更多待验证的退伍军人"

        verification_id = extract_verification_id(url)
        if not verification_id:
            return f"无法从 URL 提取 verificationId"

        try:
            session = requests.Session()

            # Step 1: 提交军人状态
            submit_military_status(verification_id, url, session)

            # Step 2: 提交个人信息
            result = submit_personal_info(verification_id, veteran, email, url, session)

            self.current_index += 1
            save_progress(self.current_index)  # 保存进度

            current_step = result.get('currentStep', 'unknown')
            current_state = result.get('currentState', 'unknown')

            if current_step == 'emailLoop':
                return f"提交成功！请检查邮箱 {email} 完成验证\n\n已处理: {self.current_index}/{len(self.veterans)}"
            elif current_step == 'error':
                return f"验证失败: {result.get('systemErrorMessage', 'unknown')}\n\n已处理: {self.current_index}/{len(self.veterans)}"
            else:
                return f"提交成功\n状态: {current_state}\n下一步: {current_step}\n\n已处理: {self.current_index}/{len(self.veterans)}"

        except requests.exceptions.HTTPError as e:
            self.current_index += 1
            save_progress(self.current_index)
            return f"API 错误: {e.response.status_code} - {e.response.text}\n\n已处理: {self.current_index}/{len(self.veterans)}"
        except Exception as e:
            self.current_index += 1
            save_progress(self.current_index)
            return f"验证失败: {str(e)}\n\n已处理: {self.current_index}/{len(self.veterans)}"

    def remaining_count(self) -> int:
        return len(self.veterans) - self.current_index

    def get_status(self) -> str:
        return f"待处理: {self.remaining_count()} / 总计: {len(self.veterans)}"


tool = None


def init_tool():
    global tool
    tool = VeteranVerificationTool(CSV_PATH)
    return tool.get_status()


def verify(url: str, email: str):
    global tool
    if tool is None:
        init_tool()

    if not url or not url.strip():
        return "请输入 SheerID URL", tool.get_status()

    if not email or not email.strip():
        return "请输入邮箱地址", tool.get_status()

    result = tool.verify_current(url.strip(), email.strip())
    return result, tool.get_status()


def reset():
    global tool
    save_progress(0)  # 重置进度
    tool = VeteranVerificationTool(CSV_PATH)
    return "", "", "已重置", tool.get_status()


with gr.Blocks() as app:
    gr.Markdown("# SheerID 退伍军人验证工具")

    with gr.Row():
        status_display = gr.Textbox(
            label="状态",
            value=init_tool(),
            interactive=False
        )

    with gr.Row():
        url_input = gr.Textbox(
            label="SheerID URL",
            placeholder="https://services.sheerid.com/verify/...?verificationId=...",
            lines=1
        )

    with gr.Row():
        email_input = gr.Textbox(
            label="邮箱",
            placeholder="veteran@email.com",
            lines=1
        )

    with gr.Row():
        submit_btn = gr.Button("提交验证", variant="primary", size="lg")
        reset_btn = gr.Button("重置队列", variant="secondary")

    with gr.Row():
        result_display = gr.Textbox(
            label="结果",
            lines=4,
            interactive=False
        )

    submit_btn.click(
        fn=verify,
        inputs=[url_input, email_input],
        outputs=[result_display, status_display]
    )

    reset_btn.click(
        fn=reset,
        outputs=[url_input, email_input, result_display, status_display]
    )


if __name__ == "__main__":
    app.launch(server_name="0.0.0.0", server_port=7860)
