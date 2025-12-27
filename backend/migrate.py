#!/usr/bin/env python3
"""数据库迁移脚本 - 添加 LinuxDO OAuth 相关表和列"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "sheerid_veteran.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 检查并创建 linuxdo_users 表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS linuxdo_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linuxdo_id INTEGER UNIQUE NOT NULL,
            username VARCHAR(100) NOT NULL,
            name VARCHAR(200),
            avatar_url VARCHAR(500),
            trust_level INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_linuxdo_users_linuxdo_id ON linuxdo_users(linuxdo_id)")

    # 检查并创建 oauth_settings 表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS oauth_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider VARCHAR(50) UNIQUE NOT NULL,
            client_id VARCHAR(200),
            client_secret VARCHAR(200),
            is_enabled BOOLEAN DEFAULT 0,
            codes_per_user INTEGER DEFAULT 2,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 检查 redeem_codes 表是否有 linuxdo_user_id 列
    cursor.execute("PRAGMA table_info(redeem_codes)")
    columns = [col[1] for col in cursor.fetchall()]

    if "linuxdo_user_id" not in columns:
        print("Adding linuxdo_user_id column to redeem_codes...")
        cursor.execute("ALTER TABLE redeem_codes ADD COLUMN linuxdo_user_id INTEGER REFERENCES linuxdo_users(id)")

    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
