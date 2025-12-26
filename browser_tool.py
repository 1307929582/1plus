#!/usr/bin/env python3
"""
SheerID Veteran Verification - Browser Automation
使用 Playwright 在浏览器中自动填写表单
"""

import csv
import time
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Page


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


def fill_sheerid_form(page: Page, veteran: Veteran, email: str):
    """在 SheerID 页面自动填写表单"""

    # 等待页面加载
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # 选择 Veteran 选项
    try:
        veteran_option = page.locator('text=Veteran').first
        if veteran_option.is_visible():
            veteran_option.click()
            time.sleep(1)
    except:
        pass

    # 填写 First Name
    first_name_input = page.locator('input[name="firstName"], input[placeholder*="First"]').first
    if first_name_input.is_visible():
        first_name_input.fill(veteran.first_name)

    # 填写 Last Name
    last_name_input = page.locator('input[name="lastName"], input[placeholder*="Last"]').first
    if last_name_input.is_visible():
        last_name_input.fill(veteran.last_name)

    # 填写 Email
    email_input = page.locator('input[name="email"], input[type="email"]').first
    if email_input.is_visible():
        email_input.fill(email)

    # 填写 Birth Date
    birth_input = page.locator('input[name="birthDate"], input[placeholder*="Birth"]').first
    if birth_input.is_visible():
        birth_input.fill(veteran.birth_date)

    # 填写 Discharge Date
    discharge_input = page.locator('input[name="dischargeDate"], input[placeholder*="Discharge"]').first
    if discharge_input.is_visible():
        discharge_input.fill(veteran.discharge_date)

    # 选择军种
    try:
        branch_select = page.locator('select, [role="combobox"]').first
        if branch_select.is_visible():
            branch_select.click()
            time.sleep(0.5)
            page.locator(f'text={veteran.org_name}').first.click()
    except:
        pass

    print(f"表单已填写: {veteran.first_name} {veteran.last_name}, {email}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SheerID 浏览器自动填写工具")
    parser.add_argument("--csv", default="veterans.csv", help="CSV 文件路径")
    parser.add_argument("--url", required=True, help="SheerID 验证 URL")
    parser.add_argument("--email", required=True, help="邮箱地址")
    parser.add_argument("--index", type=int, default=0, help="从第几条开始 (0-based)")
    args = parser.parse_args()

    veterans = load_veterans_from_csv(args.csv)
    if args.index >= len(veterans):
        print(f"索引 {args.index} 超出范围，共 {len(veterans)} 条数据")
        return

    veteran = veterans[args.index]
    print(f"使用第 {args.index + 1} 条数据: {veteran.first_name} {veteran.last_name}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print(f"打开: {args.url}")
        page.goto(args.url)

        fill_sheerid_form(page, veteran, args.email)

        print("\n表单已填写，请手动检查并提交。")
        print("按 Enter 关闭浏览器...")
        input()

        browser.close()


if __name__ == "__main__":
    main()
