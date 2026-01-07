"""
输入验证模块
"""
import re
from typing import Optional
from pydantic import BaseModel, validator, EmailStr, Field
from errors import ErrorCode, bad_request


# 正则表达式
URL_PATTERN = re.compile(
    r'^https?://services\.sheerid\.com/.*verificationId=[a-f0-9]{24}',
    re.IGNORECASE
)
CODE_PATTERN = re.compile(r'^[A-Z0-9]{8,16}$')
VERIFICATION_ID_PATTERN = re.compile(r'^[a-f0-9]{24}$', re.IGNORECASE)
EMAIL_TOKEN_PATTERN = re.compile(r'^\d{4,8}$')


def validate_sheerid_url(url: str) -> str:
    """验证 SheerID URL"""
    if not url:
        bad_request(ErrorCode.INVALID_URL, "验证链接不能为空")
    if not URL_PATTERN.match(url):
        bad_request(ErrorCode.INVALID_URL, "请输入有效的 SheerID 验证链接")
    return url


def validate_redeem_code(code: str) -> str:
    """验证兑换码格式"""
    code = code.strip().upper()
    if not code:
        bad_request(ErrorCode.INVALID_CODE_FORMAT, "兑换码不能为空")
    if not CODE_PATTERN.match(code):
        bad_request(ErrorCode.INVALID_CODE_FORMAT, "兑换码格式错误")
    return code


def extract_verification_id(url: str) -> Optional[str]:
    """从 URL 提取 verificationId"""
    patterns = [
        r"[?&]verificationId=([a-f0-9]{24})",
        r"/verification/([a-f0-9]{24})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_email_token(input_str: str) -> Optional[str]:
    """从输入中提取邮件验证码"""
    input_str = input_str.strip()

    # 如果是纯数字
    if input_str.isdigit():
        return input_str

    # 尝试从 URL 提取
    patterns = [
        r"[?&]emailToken=(\d+)",
        r"[?&]token=(\d+)",
        r"/token/(\d+)",
        r"[?&]t=(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, input_str)
        if match:
            return match.group(1)

    return None


# Pydantic 模型
class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)


class AdminCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

    @validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('用户名只能包含字母、数字和下划线')
        return v


class RedeemCodeCreateRequest(BaseModel):
    total_uses: int = Field(default=1, ge=1, le=100)
    expires_days: Optional[int] = Field(default=None, ge=1, le=365)
    count: int = Field(default=1, ge=1, le=100)


class VerifyRequest(BaseModel):
    code: str = Field(..., min_length=8, max_length=16)
    url: str = Field(..., min_length=20, max_length=500)
    email: EmailStr
    udid: Optional[str] = Field(default=None, max_length=100)

    @validator('code')
    def validate_code(cls, v):
        return v.strip().upper()

    @validator('url')
    def validate_url(cls, v):
        if not URL_PATTERN.match(v):
            raise ValueError('请输入有效的 SheerID 验证链接')
        return v


class GetVeteranRequest(BaseModel):
    code: str = Field(..., min_length=8, max_length=16)

    @validator('code')
    def validate_code(cls, v):
        return v.strip().upper()


class RecordResultRequest(BaseModel):
    veteran_id: int = Field(..., gt=0)
    code_id: int = Field(..., gt=0)
    success: bool
    email: EmailStr
    token: str = Field(..., min_length=20, max_length=100)


class VerifyStep1Request(BaseModel):
    code: str = Field(..., min_length=8, max_length=16)
    url: str = Field(..., min_length=20, max_length=500)
    email: EmailStr
    udid: Optional[str] = Field(default=None, max_length=100)

    @validator('code')
    def validate_code(cls, v):
        return v.strip().upper()

    @validator('url')
    def validate_url(cls, v):
        if not URL_PATTERN.match(v):
            raise ValueError('请输入有效的 SheerID 验证链接')
        return v


class VerifyStep2Request(BaseModel):
    verification_id: str = Field(..., min_length=24, max_length=24)
    token: str = Field(..., min_length=1, max_length=500)

    @validator('verification_id')
    def validate_verification_id(cls, v):
        if not VERIFICATION_ID_PATTERN.match(v):
            raise ValueError('无效的验证 ID')
        return v


class OAuthSettingsUpdateRequest(BaseModel):
    client_id: Optional[str] = Field(default=None, max_length=200)
    client_secret: Optional[str] = Field(default=None, max_length=200)
    is_enabled: Optional[bool] = None
    codes_per_user: Optional[int] = Field(default=None, ge=1, le=10)
    min_trust_level: Optional[int] = Field(default=None, ge=0, le=4)


class ProxySettingsUpdateRequest(BaseModel):
    is_enabled: Optional[bool] = None
    proxy_type: Optional[str] = Field(default=None, pattern=r'^(http|socks5)$')
    host: Optional[str] = Field(default=None, max_length=200)
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    username: Optional[str] = Field(default=None, max_length=200)
    password: Optional[str] = Field(default=None, max_length=200)


# CSV 导入限制
MAX_CSV_SIZE_MB = 10
MAX_CSV_ROWS = 10000


def validate_csv_file(content: bytes) -> str:
    """验证 CSV 文件"""
    # 检查大小
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_CSV_SIZE_MB:
        bad_request(ErrorCode.FILE_TOO_LARGE, f"文件大小不能超过 {MAX_CSV_SIZE_MB}MB")

    # 尝试解码
    try:
        decoded = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            decoded = content.decode("gbk")
        except UnicodeDecodeError:
            bad_request(ErrorCode.INVALID_FILE_FORMAT, "文件编码错误，请使用 UTF-8 编码")

    # 检查行数
    lines = decoded.strip().split('\n')
    if len(lines) > MAX_CSV_ROWS:
        bad_request(ErrorCode.FILE_TOO_LARGE, f"文件行数不能超过 {MAX_CSV_ROWS} 行")

    return decoded
