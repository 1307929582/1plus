"""
验证会话模块 - 持久化验证状态
"""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from models import Base
import secrets


class VerificationSession(Base):
    """验证会话模型 - 替代内存存储"""
    __tablename__ = "verification_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_token = Column(String(64), unique=True, nullable=False, index=True)
    verification_id = Column(String(50), nullable=True)  # SheerID verification ID
    fingerprint = Column(String(100), nullable=True)

    veteran_id = Column(Integer, nullable=False)
    code_id = Column(Integer, nullable=False)
    email = Column(String(200), nullable=True)
    url = Column(Text, nullable=True)

    session_type = Column(String(20), nullable=False)  # 'get_veteran' or 'two_step'
    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


def create_verification_session(
    db: Session,
    veteran_id: int,
    code_id: int,
    session_type: str = "get_veteran",
    verification_id: Optional[str] = None,
    fingerprint: Optional[str] = None,
    email: Optional[str] = None,
    url: Optional[str] = None,
    ttl_minutes: int = 60
) -> str:
    """创建验证会话，返回 session_token"""
    token = secrets.token_urlsafe(32)
    session = VerificationSession(
        session_token=token,
        verification_id=verification_id,
        fingerprint=fingerprint,
        veteran_id=veteran_id,
        code_id=code_id,
        email=email,
        url=url,
        session_type=session_type,
        expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes)
    )
    db.add(session)
    db.commit()
    return token


def get_verification_session(db: Session, token: str) -> Optional[VerificationSession]:
    """获取验证会话"""
    session = db.query(VerificationSession).filter(
        VerificationSession.session_token == token,
        VerificationSession.is_used == False,
        VerificationSession.expires_at > datetime.utcnow()
    ).first()
    return session


def mark_session_used(db: Session, token: str):
    """标记会话已使用"""
    session = db.query(VerificationSession).filter(
        VerificationSession.session_token == token
    ).first()
    if session:
        session.is_used = True
        db.commit()


def cleanup_expired_sessions(db: Session):
    """清理过期会话"""
    db.query(VerificationSession).filter(
        VerificationSession.expires_at < datetime.utcnow()
    ).delete(synchronize_session=False)
    db.commit()


class OAuthState(Base):
    """OAuth 状态存储 - 防止 CSRF"""
    __tablename__ = "oauth_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    state = Column(String(64), unique=True, nullable=False, index=True)
    redirect_uri = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)


def create_oauth_state(db: Session, redirect_uri: str, ttl_minutes: int = 10) -> str:
    """创建 OAuth state"""
    state = secrets.token_urlsafe(32)
    oauth_state = OAuthState(
        state=state,
        redirect_uri=redirect_uri,
        expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes)
    )
    db.add(oauth_state)
    db.commit()
    return state


def validate_oauth_state(db: Session, state: str, redirect_uri: str) -> bool:
    """验证 OAuth state"""
    oauth_state = db.query(OAuthState).filter(
        OAuthState.state == state,
        OAuthState.is_used == False,
        OAuthState.expires_at > datetime.utcnow()
    ).first()

    if not oauth_state:
        return False

    # 验证 redirect_uri 匹配
    if oauth_state.redirect_uri != redirect_uri:
        return False

    # 标记为已使用
    oauth_state.is_used = True
    db.commit()
    return True


def cleanup_expired_oauth_states(db: Session):
    """清理过期的 OAuth state"""
    db.query(OAuthState).filter(
        OAuthState.expires_at < datetime.utcnow()
    ).delete(synchronize_session=False)
    db.commit()
