"""
认证模块 - JWT + bcrypt 实现
"""
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db

# 密码哈希配置
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT 配置
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """使用 bcrypt 哈希密码"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """解码 JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_token_from_cookie(request: Request) -> Optional[str]:
    """从 cookie 获取 token"""
    return request.cookies.get("access_token")


def get_token_from_header(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[str]:
    """从 header 获取 token"""
    if credentials:
        return credentials.credentials
    return None


async def get_current_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """获取当前管理员 - 支持 cookie 和 header 两种方式"""
    from models import Admin

    # 优先从 cookie 获取
    token = get_token_from_cookie(request)

    # 其次从 header 获取
    if not token and credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_REQUIRED", "message": "请先登录"}
        )

    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_INVALID", "message": "登录已过期，请重新登录"}
        )

    admin_id = payload.get("sub")
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_INVALID", "message": "无效的认证信息"}
        )

    admin = db.query(Admin).filter(Admin.id == int(admin_id)).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "用户不存在"}
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DISABLED", "message": "账户已被禁用"}
        )

    return admin


def set_auth_cookie(response: Response, token: str):
    """设置认证 cookie"""
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # 生产环境应设为 True
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


def clear_auth_cookie(response: Response):
    """清除认证 cookie"""
    response.delete_cookie(key="access_token")
