"""
统一错误处理模块
"""
from typing import Optional, Any, Dict
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorCode:
    """错误码定义"""
    # 认证相关 (1xxx)
    AUTH_REQUIRED = "AUTH_REQUIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    ADMIN_EXISTS = "ADMIN_EXISTS"

    # 权限相关 (2xxx)
    PERMISSION_DENIED = "PERMISSION_DENIED"
    TRUST_LEVEL_INSUFFICIENT = "TRUST_LEVEL_INSUFFICIENT"

    # 资源相关 (3xxx)
    NOT_FOUND = "NOT_FOUND"
    CODE_NOT_FOUND = "CODE_NOT_FOUND"
    VETERAN_NOT_FOUND = "VETERAN_NOT_FOUND"
    USER_NOT_FOUND = "USER_NOT_FOUND"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"

    # 业务逻辑相关 (4xxx)
    CODE_DISABLED = "CODE_DISABLED"
    CODE_EXHAUSTED = "CODE_EXHAUSTED"
    CODE_EXPIRED = "CODE_EXPIRED"
    NO_PENDING_VETERAN = "NO_PENDING_VETERAN"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    TOKEN_MISMATCH = "TOKEN_MISMATCH"

    # 验证相关 (5xxx)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_URL = "INVALID_URL"
    INVALID_EMAIL = "INVALID_EMAIL"
    INVALID_CODE_FORMAT = "INVALID_CODE_FORMAT"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    INVALID_FILE_FORMAT = "INVALID_FILE_FORMAT"

    # OAuth 相关 (6xxx)
    OAUTH_NOT_CONFIGURED = "OAUTH_NOT_CONFIGURED"
    OAUTH_STATE_INVALID = "OAUTH_STATE_INVALID"
    OAUTH_TOKEN_FAILED = "OAUTH_TOKEN_FAILED"
    OAUTH_USER_FAILED = "OAUTH_USER_FAILED"

    # 服务器错误 (9xxx)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR"


# 错误消息映射（中文）
ERROR_MESSAGES: Dict[str, str] = {
    ErrorCode.AUTH_REQUIRED: "请先登录",
    ErrorCode.TOKEN_INVALID: "登录已过期，请重新登录",
    ErrorCode.TOKEN_EXPIRED: "登录已过期，请重新登录",
    ErrorCode.INVALID_CREDENTIALS: "用户名或密码错误",
    ErrorCode.ACCOUNT_DISABLED: "账户已被禁用",
    ErrorCode.ADMIN_EXISTS: "管理员账户已存在",

    ErrorCode.PERMISSION_DENIED: "权限不足",
    ErrorCode.TRUST_LEVEL_INSUFFICIENT: "信任等级不足",

    ErrorCode.NOT_FOUND: "资源不存在",
    ErrorCode.CODE_NOT_FOUND: "兑换码不存在",
    ErrorCode.VETERAN_NOT_FOUND: "退伍军人记录不存在",
    ErrorCode.USER_NOT_FOUND: "用户不存在",
    ErrorCode.SESSION_NOT_FOUND: "验证会话不存在或已过期",

    ErrorCode.CODE_DISABLED: "兑换码已禁用",
    ErrorCode.CODE_EXHAUSTED: "兑换码已用完",
    ErrorCode.CODE_EXPIRED: "兑换码已过期",
    ErrorCode.NO_PENDING_VETERAN: "没有待验证的退伍军人",
    ErrorCode.VERIFICATION_FAILED: "验证失败",
    ErrorCode.TOKEN_MISMATCH: "验证数据不匹配",

    ErrorCode.VALIDATION_ERROR: "输入数据格式错误",
    ErrorCode.INVALID_URL: "无效的验证链接",
    ErrorCode.INVALID_EMAIL: "无效的邮箱地址",
    ErrorCode.INVALID_CODE_FORMAT: "兑换码格式错误",
    ErrorCode.FILE_TOO_LARGE: "文件过大",
    ErrorCode.INVALID_FILE_FORMAT: "文件格式错误",

    ErrorCode.OAUTH_NOT_CONFIGURED: "OAuth 未配置",
    ErrorCode.OAUTH_STATE_INVALID: "OAuth 状态验证失败",
    ErrorCode.OAUTH_TOKEN_FAILED: "获取 OAuth token 失败",
    ErrorCode.OAUTH_USER_FAILED: "获取用户信息失败",

    ErrorCode.INTERNAL_ERROR: "服务器内部错误",
    ErrorCode.EXTERNAL_API_ERROR: "外部服务调用失败",
}


class APIError(BaseModel):
    """API 错误响应模型"""
    code: str
    message: str
    details: Optional[Any] = None


class APIResponse(BaseModel):
    """统一 API 响应模型"""
    success: bool
    data: Optional[Any] = None
    error: Optional[APIError] = None


def success_response(data: Any = None) -> dict:
    """成功响应"""
    return {"success": True, "data": data, "error": None}


def error_response(
    code: str,
    message: Optional[str] = None,
    details: Optional[Any] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST
) -> JSONResponse:
    """错误响应"""
    msg = message or ERROR_MESSAGES.get(code, "未知错误")
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": {
                "code": code,
                "message": msg,
                "details": details
            }
        }
    )


def raise_error(
    code: str,
    message: Optional[str] = None,
    details: Optional[Any] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST
):
    """抛出 HTTP 异常"""
    msg = message or ERROR_MESSAGES.get(code, "未知错误")
    raise HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": msg,
            "details": details
        }
    )


# 常用错误快捷方法
def not_found(code: str = ErrorCode.NOT_FOUND, message: Optional[str] = None):
    raise_error(code, message, status_code=status.HTTP_404_NOT_FOUND)


def unauthorized(code: str = ErrorCode.AUTH_REQUIRED, message: Optional[str] = None):
    raise_error(code, message, status_code=status.HTTP_401_UNAUTHORIZED)


def forbidden(code: str = ErrorCode.PERMISSION_DENIED, message: Optional[str] = None):
    raise_error(code, message, status_code=status.HTTP_403_FORBIDDEN)


def bad_request(code: str = ErrorCode.VALIDATION_ERROR, message: Optional[str] = None, details: Any = None):
    raise_error(code, message, details, status_code=status.HTTP_400_BAD_REQUEST)
