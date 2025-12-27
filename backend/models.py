"""
数据库模型
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum

Base = declarative_base()


class VerificationStatus(enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    EMAIL_SENT = "email_sent"


class Veteran(Base):
    __tablename__ = "veterans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String(500), nullable=False)
    last_name = Column(String(100), nullable=False)
    birth_date = Column(String(20), nullable=False)
    discharge_date = Column(String(20), nullable=False)
    org_id = Column(Integer, nullable=False)
    org_name = Column(String(100), nullable=False)

    status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    email_used = Column(String(200), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RedeemCode(Base):
    __tablename__ = "redeem_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    total_uses = Column(Integer, default=1)  # 总可用次数
    used_count = Column(Integer, default=0)  # 已使用次数
    is_active = Column(Boolean, default=True)

    linuxdo_user_id = Column(Integer, ForeignKey("linuxdo_users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    # 关联使用记录
    usages = relationship("CodeUsage", back_populates="redeem_code")
    linuxdo_user = relationship("LinuxDOUser", back_populates="codes")


class CodeUsage(Base):
    __tablename__ = "code_usages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code_id = Column(Integer, ForeignKey("redeem_codes.id"), nullable=False)
    veteran_id = Column(Integer, ForeignKey("veterans.id"), nullable=False)
    email = Column(String(200), nullable=False)
    verification_url = Column(Text, nullable=False)

    status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    result_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    redeem_code = relationship("RedeemCode", back_populates="usages")
    veteran = relationship("Veteran")


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class VerificationLog(Base):
    __tablename__ = "verification_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    veteran_id = Column(Integer, ForeignKey("veterans.id"), nullable=True)
    code_id = Column(Integer, ForeignKey("redeem_codes.id"), nullable=True)

    action = Column(String(50), nullable=False)  # submit, success, failed, etc.
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class LinuxDOUser(Base):
    __tablename__ = "linuxdo_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    linuxdo_id = Column(Integer, unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False)
    name = Column(String(200), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    trust_level = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)

    codes = relationship("RedeemCode", back_populates="linuxdo_user")


class OAuthSettings(Base):
    __tablename__ = "oauth_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), unique=True, nullable=False)  # linuxdo
    client_id = Column(String(200), nullable=True)
    client_secret = Column(String(200), nullable=True)
    is_enabled = Column(Boolean, default=False)
    codes_per_user = Column(Integer, default=2)  # 每用户发放兑换码数量

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
