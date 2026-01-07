"""
数据库模型
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# UTC+8 时区
UTC8 = timezone(timedelta(hours=8))


def now_utc8():
    """返回 UTC+8 当前时间"""
    return datetime.now(UTC8).replace(tzinfo=None)


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=now_utc8)
    last_login = Column(DateTime, nullable=True)


class VerificationHistory(Base):
    """验证历史记录"""
    __tablename__ = "verification_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(500), nullable=False)
    birth_date = Column(String(20), nullable=False)
    discharge_date = Column(String(20), nullable=False)
    org_id = Column(Integer, nullable=False)
    org_name = Column(String(100), nullable=False)
    email = Column(String(200), nullable=True)
    client_ip = Column(String(50), nullable=True)
    success = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now_utc8)


class MockDataCounter(Base):
    """模拟数据计数器"""
    __tablename__ = "mock_data_counter"

    id = Column(Integer, primary_key=True, autoincrement=True)
    counter = Column(Integer, default=1)
    updated_at = Column(DateTime, default=now_utc8, onupdate=now_utc8)


class ProxySettings(Base):
    __tablename__ = "proxy_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    is_enabled = Column(Boolean, default=False)
    proxy_type = Column(String(20), default="socks5")
    host = Column(String(200), nullable=True)
    port = Column(Integer, nullable=True)
    username = Column(String(200), nullable=True)
    password = Column(String(200), nullable=True)

    updated_at = Column(DateTime, default=now_utc8, onupdate=now_utc8)


class CaptchaSettings(Base):
    __tablename__ = "captcha_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    turnstile_site_key = Column(String(200), nullable=True)
    turnstile_secret = Column(String(200), nullable=True)
    hcaptcha_site_key = Column(String(200), nullable=True)
    hcaptcha_secret = Column(String(200), nullable=True)
    is_enabled = Column(Boolean, default=False)

    updated_at = Column(DateTime, default=now_utc8, onupdate=now_utc8)


class SiteSettings(Base):
    """站点公告与广告配置"""
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notice_enabled = Column(Boolean, default=False)
    notice_content = Column(Text, nullable=True)
    left_ad_enabled = Column(Boolean, default=False)
    left_ad_content = Column(Text, nullable=True)
    right_ad_enabled = Column(Boolean, default=False)
    right_ad_content = Column(Text, nullable=True)

    updated_at = Column(DateTime, default=now_utc8, onupdate=now_utc8)
