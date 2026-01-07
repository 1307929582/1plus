"""
验证服务抽象层 - 支持 Mock 和真实模式
"""
import csv
import os
import random
import uuid
import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Protocol
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class VeteranData:
    """退伍军人数据"""
    id: int
    first_name: str
    last_name: str
    birth_date: str
    discharge_date: str
    org_id: int
    org_name: str


@dataclass
class VerificationResult:
    """验证结果"""
    success: bool
    step: str  # emailLoop, success, error
    verification_id: Optional[str] = None
    fingerprint: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class VeteranRepository(Protocol):
    """退伍军人数据仓库协议"""

    def next_pending(self) -> Optional[VeteranData]:
        """获取下一个待验证的退伍军人"""
        ...

    def mark_used(self, veteran_id: int, success: bool) -> None:
        """标记退伍军人已使用"""
        ...


class SheerIDClient(Protocol):
    """SheerID 客户端协议"""

    async def start_verification(
        self,
        veteran: VeteranData,
        url: str,
        email: str,
        fingerprint: str
    ) -> VerificationResult:
        """开始验证流程"""
        ...

    async def complete_verification(
        self,
        verification_id: str,
        email_token: str,
        fingerprint: str
    ) -> VerificationResult:
        """完成验证（邮件 token）"""
        ...


# ==================== Mock 实现 ====================

class MockVeteranRepository:
    """Mock 退伍军人数据仓库 - 从 CSV 轮询"""

    def __init__(self, csv_path: str = "veterans_diverse.csv"):
        self.veterans: List[VeteranData] = []
        self.index = 0
        self._load_csv(csv_path)

    def _load_csv(self, csv_path: str):
        """加载 CSV 数据"""
        if not os.path.exists(csv_path):
            # 使用默认测试数据
            self.veterans = [
                VeteranData(
                    id=1,
                    first_name="John",
                    last_name="Smith",
                    birth_date="1985-03-15",
                    discharge_date="2015-06-30",
                    org_id=4070,
                    org_name="Army"
                ),
                VeteranData(
                    id=2,
                    first_name="Michael",
                    last_name="Johnson",
                    birth_date="1990-07-22",
                    discharge_date="2020-12-15",
                    org_id=4073,
                    org_name="Air Force"
                ),
                VeteranData(
                    id=3,
                    first_name="David",
                    last_name="Williams",
                    birth_date="1988-11-08",
                    discharge_date="2018-04-20",
                    org_id=4075,
                    org_name="Navy"
                ),
            ]
            logger.info(f"Using default test veterans ({len(self.veterans)} records)")
            return

        try:
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    self.veterans.append(VeteranData(
                        id=i + 1,
                        first_name=row.get("first_name", "Test"),
                        last_name=row.get("last_name", "User"),
                        birth_date=row.get("birth_date", "1990-01-01"),
                        discharge_date=row.get("discharge_date", "2020-01-01"),
                        org_id=int(row.get("org_id", 4070)),
                        org_name=row.get("org_name", "Army"),
                    ))
            logger.info(f"Loaded {len(self.veterans)} veterans from {csv_path}")
        except Exception as e:
            logger.error(f"Failed to load CSV: {e}")
            self.veterans = []

    def next_pending(self) -> Optional[VeteranData]:
        """轮询获取下一个退伍军人"""
        if not self.veterans:
            return None
        veteran = self.veterans[self.index % len(self.veterans)]
        self.index += 1
        return veteran

    def mark_used(self, veteran_id: int, success: bool) -> None:
        """Mock 实现 - 不做任何操作"""
        logger.info(f"[MOCK] Marked veteran {veteran_id} as {'success' if success else 'failed'}")


class MockSheerIDClient:
    """Mock SheerID 客户端 - 模拟验证流程"""

    def __init__(self, simulate_delay: bool = True, success_rate: float = 0.9):
        self.simulate_delay = simulate_delay
        self.success_rate = success_rate
        self.pending_verifications = {}  # verification_id -> fingerprint

    async def start_verification(
        self,
        veteran: VeteranData,
        url: str,
        email: str,
        fingerprint: str
    ) -> VerificationResult:
        """模拟开始验证"""
        if self.simulate_delay:
            await asyncio.sleep(random.uniform(0.5, 1.5))

        verification_id = str(uuid.uuid4()).replace("-", "")[:24]
        self.pending_verifications[verification_id] = fingerprint

        logger.info(f"[MOCK] Started verification for {veteran.first_name} {veteran.last_name}")

        # 模拟直接成功（小概率）
        if random.random() > 0.95:
            return VerificationResult(
                success=True,
                step="success",
                verification_id=verification_id,
                fingerprint=fingerprint,
                message="验证成功！"
            )

        # 正常流程 - 需要邮件验证
        return VerificationResult(
            success=True,
            step="emailLoop",
            verification_id=verification_id,
            fingerprint=fingerprint,
            message="验证邮件已发送，请查收邮箱"
        )

    async def complete_verification(
        self,
        verification_id: str,
        email_token: str,
        fingerprint: str
    ) -> VerificationResult:
        """模拟完成验证"""
        if self.simulate_delay:
            await asyncio.sleep(random.uniform(0.3, 1.0))

        # 检查 verification_id 是否存在
        if verification_id not in self.pending_verifications:
            return VerificationResult(
                success=False,
                step="error",
                error="无效的 verification_id"
            )

        # 模拟成功/失败
        if random.random() < self.success_rate:
            del self.pending_verifications[verification_id]
            return VerificationResult(
                success=True,
                step="success",
                message="验证成功！"
            )
        else:
            return VerificationResult(
                success=False,
                step="error",
                error="Token 无效或已过期"
            )


# ==================== 真实实现 ====================

class DbVeteranRepository:
    """数据库退伍军人仓库"""

    def __init__(self, db_session_factory):
        self.db_session_factory = db_session_factory

    def next_pending(self) -> Optional[VeteranData]:
        """从数据库获取下一个待验证的退伍军人"""
        from models import Veteran, VerificationStatus

        db = self.db_session_factory()
        try:
            veteran = db.query(Veteran).filter(
                Veteran.status == VerificationStatus.PENDING
            ).first()

            if not veteran:
                return None

            return VeteranData(
                id=veteran.id,
                first_name=veteran.first_name,
                last_name=veteran.last_name,
                birth_date=veteran.birth_date,
                discharge_date=veteran.discharge_date,
                org_id=veteran.org_id,
                org_name=veteran.org_name,
            )
        finally:
            db.close()

    def mark_used(self, veteran_id: int, success: bool) -> None:
        """标记退伍军人状态"""
        from models import Veteran, VerificationStatus

        db = self.db_session_factory()
        try:
            veteran = db.query(Veteran).filter(Veteran.id == veteran_id).first()
            if veteran:
                veteran.status = VerificationStatus.SUCCESS if success else VerificationStatus.FAILED
                veteran.verified_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()


class RealSheerIDClient:
    """真实 SheerID 客户端"""

    def __init__(self):
        from sheerid_service import verify_veteran_step1, complete_email_loop
        self._verify_step1 = verify_veteran_step1
        self._complete_email_loop = complete_email_loop

    async def start_verification(
        self,
        veteran: VeteranData,
        url: str,
        email: str,
        fingerprint: str
    ) -> VerificationResult:
        """调用真实 SheerID API"""
        result = self._verify_step1(
            url=url,
            first_name=veteran.first_name,
            last_name=veteran.last_name,
            birth_date=veteran.birth_date,
            discharge_date=veteran.discharge_date,
            org_id=veteran.org_id,
            org_name=veteran.org_name,
            email=email,
            client_udid=fingerprint
        )

        return VerificationResult(
            success=result.get("success", False),
            step=result.get("step", "unknown"),
            verification_id=result.get("verification_id"),
            fingerprint=result.get("fingerprint"),
            message=result.get("message"),
            error=result.get("error")
        )

    async def complete_verification(
        self,
        verification_id: str,
        email_token: str,
        fingerprint: str
    ) -> VerificationResult:
        """调用真实 SheerID API 完成验证"""
        result = self._complete_email_loop(verification_id, email_token, fingerprint)

        return VerificationResult(
            success=result.get("success", False),
            step=result.get("step", "unknown"),
            message=result.get("message"),
            error=result.get("error")
        )


# ==================== 服务工厂 ====================

class ServiceMode:
    """服务模式配置"""
    MOCK = "mock"
    REAL = "real"


# 全局配置
_veteran_mode = ServiceMode.MOCK
_sheerid_mode = ServiceMode.MOCK
_db_session_factory = None


def configure_services(
    veteran_mode: str = ServiceMode.MOCK,
    sheerid_mode: str = ServiceMode.MOCK,
    db_session_factory=None
):
    """配置服务模式"""
    global _veteran_mode, _sheerid_mode, _db_session_factory
    _veteran_mode = veteran_mode
    _sheerid_mode = sheerid_mode
    _db_session_factory = db_session_factory
    logger.info(f"Services configured: veteran={veteran_mode}, sheerid={sheerid_mode}")


def get_veteran_repository() -> VeteranRepository:
    """获取退伍军人仓库实例"""
    if _veteran_mode == ServiceMode.MOCK:
        return MockVeteranRepository()
    else:
        if not _db_session_factory:
            raise RuntimeError("Database session factory not configured")
        return DbVeteranRepository(_db_session_factory)


def get_sheerid_client() -> SheerIDClient:
    """获取 SheerID 客户端实例"""
    if _sheerid_mode == ServiceMode.MOCK:
        return MockSheerIDClient()
    else:
        return RealSheerIDClient()


def is_test_mode() -> bool:
    """检查是否为测试模式"""
    return _veteran_mode == ServiceMode.MOCK or _sheerid_mode == ServiceMode.MOCK
