"""
SSE Job 系统 - 管理验证任务和实时进度推送
"""
import asyncio
import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """任务状态"""
    QUEUED = "queued"
    CAPTCHA_VERIFIED = "captcha_verified"
    FETCHING_VETERAN = "fetching_veteran"
    SUBMITTING_STEP1 = "submitting_step1"
    AWAITING_EMAIL = "awaiting_email"
    SUBMITTING_STEP2 = "submitting_step2"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class JobEvent:
    """任务事件"""
    type: str
    data: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class VerificationJob:
    """验证任务"""
    id: str
    status: JobStatus
    url: str
    email: str
    created_at: datetime
    updated_at: datetime
    verification_id: Optional[str] = None
    fingerprint: Optional[str] = None
    veteran_name: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    events: List[JobEvent] = field(default_factory=list)
    client_ip: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status.value,
            "url": self.url,
            "email": self.email,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "verification_id": self.verification_id,
            "veteran_name": self.veteran_name,
            "message": self.message,
            "error": self.error,
        }


class JobManager:
    """任务管理器"""

    def __init__(self, max_jobs: int = 1000, job_ttl_minutes: int = 30):
        self.jobs: Dict[str, VerificationJob] = {}
        self.subscribers: Dict[str, List[asyncio.Queue]] = {}
        self.max_jobs = max_jobs
        self.job_ttl = timedelta(minutes=job_ttl_minutes)
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup_task(self):
        """启动清理任务"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """定期清理过期任务"""
        while True:
            await asyncio.sleep(60)  # 每分钟检查一次
            self._cleanup_expired_jobs()

    def _cleanup_expired_jobs(self):
        """清理过期任务"""
        now = datetime.utcnow()
        expired = [
            job_id for job_id, job in self.jobs.items()
            if now - job.created_at > self.job_ttl
        ]
        for job_id in expired:
            self._remove_job(job_id)
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired jobs")

    def _remove_job(self, job_id: str):
        """移除任务"""
        if job_id in self.jobs:
            del self.jobs[job_id]
        if job_id in self.subscribers:
            del self.subscribers[job_id]

    def create_job(self, url: str, email: str, client_ip: Optional[str] = None) -> VerificationJob:
        """创建新任务"""
        # 清理旧任务以防止内存溢出
        if len(self.jobs) >= self.max_jobs:
            self._cleanup_expired_jobs()

        job_id = str(uuid.uuid4())[:8]
        now = datetime.utcnow()

        job = VerificationJob(
            id=job_id,
            status=JobStatus.QUEUED,
            url=url,
            email=email,
            created_at=now,
            updated_at=now,
            client_ip=client_ip,
        )

        self.jobs[job_id] = job
        self.subscribers[job_id] = []

        logger.info(f"Created job {job_id} for {email}")
        return job

    def get_job(self, job_id: str) -> Optional[VerificationJob]:
        """获取任务"""
        return self.jobs.get(job_id)

    def update_job(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        verification_id: Optional[str] = None,
        fingerprint: Optional[str] = None,
        veteran_name: Optional[str] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[VerificationJob]:
        """更新任务状态"""
        job = self.jobs.get(job_id)
        if not job:
            return None

        if status:
            job.status = status
        if verification_id:
            job.verification_id = verification_id
        if fingerprint:
            job.fingerprint = fingerprint
        if veteran_name:
            job.veteran_name = veteran_name
        if message:
            job.message = message
        if error:
            job.error = error

        job.updated_at = datetime.utcnow()

        # 发布事件
        event_data = {
            "status": job.status.value,
            "message": message or error,
            "veteran_name": veteran_name,
        }
        self.publish(job_id, job.status.value, event_data)

        return job

    def subscribe(self, job_id: str) -> asyncio.Queue:
        """订阅任务事件"""
        if job_id not in self.subscribers:
            self.subscribers[job_id] = []

        queue: asyncio.Queue = asyncio.Queue()
        self.subscribers[job_id].append(queue)
        logger.debug(f"New subscriber for job {job_id}, total: {len(self.subscribers[job_id])}")
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue):
        """取消订阅"""
        if job_id in self.subscribers and queue in self.subscribers[job_id]:
            self.subscribers[job_id].remove(queue)
            logger.debug(f"Unsubscribed from job {job_id}")

    def publish(self, job_id: str, event_type: str, data: Dict[str, Any]):
        """发布事件到所有订阅者"""
        if job_id not in self.subscribers:
            return

        event = JobEvent(type=event_type, data=data)

        # 记录事件到任务
        job = self.jobs.get(job_id)
        if job:
            job.events.append(event)

        # 推送到所有订阅者
        for queue in self.subscribers[job_id]:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for job {job_id}")

    def get_active_jobs_count(self, client_ip: Optional[str] = None) -> int:
        """获取活跃任务数量"""
        active_statuses = {
            JobStatus.QUEUED,
            JobStatus.CAPTCHA_VERIFIED,
            JobStatus.FETCHING_VETERAN,
            JobStatus.SUBMITTING_STEP1,
            JobStatus.AWAITING_EMAIL,
            JobStatus.SUBMITTING_STEP2,
        }

        count = 0
        for job in self.jobs.values():
            if job.status in active_statuses:
                if client_ip is None or job.client_ip == client_ip:
                    count += 1
        return count


# 全局任务管理器实例
job_manager = JobManager()


def get_job_manager() -> JobManager:
    """获取任务管理器实例"""
    return job_manager


def format_sse_event(event: JobEvent) -> str:
    """格式化 SSE 事件"""
    data = json.dumps({
        "type": event.type,
        "data": event.data,
        "timestamp": event.timestamp,
    }, ensure_ascii=False)
    return f"event: {event.type}\ndata: {data}\n\n"


def format_sse_message(event_type: str, data: Any) -> str:
    """格式化 SSE 消息"""
    json_data = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {json_data}\n\n"
