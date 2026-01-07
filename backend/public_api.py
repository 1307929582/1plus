"""
公开验证 API - 无需登录，支持 Captcha 验证
"""
import asyncio
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr

from captcha_service import verify_captchas
from verification_services import (
    get_veteran_repository,
    get_sheerid_client,
    is_test_mode,
    VeteranData,
)
from job_manager import (
    get_job_manager,
    JobStatus,
    format_sse_event,
    format_sse_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public"])


# ==================== Request Models ====================

class SubmitVerificationRequest(BaseModel):
    """提交验证请求"""
    url: str
    email: str
    turnstile_token: Optional[str] = None
    hcaptcha_token: Optional[str] = None
    fingerprint: Optional[str] = None


class CompleteVerificationRequest(BaseModel):
    """完成验证请求"""
    job_id: str
    email_token: str
    turnstile_token: Optional[str] = None
    hcaptcha_token: Optional[str] = None


# ==================== Rate Limiting ====================

# 简单的内存速率限制（生产环境应使用 Redis）
_rate_limits: dict = {}  # ip -> {count, reset_time}
RATE_LIMIT_PER_MINUTE = 5
RATE_LIMIT_PER_HOUR = 20


def check_rate_limit(client_ip: str) -> bool:
    """检查速率限制"""
    now = datetime.utcnow()
    key = f"{client_ip}"

    if key not in _rate_limits:
        _rate_limits[key] = {"minute_count": 0, "hour_count": 0, "minute_reset": now, "hour_reset": now}

    limits = _rate_limits[key]

    # 重置分钟计数
    if (now - limits["minute_reset"]).seconds >= 60:
        limits["minute_count"] = 0
        limits["minute_reset"] = now

    # 重置小时计数
    if (now - limits["hour_reset"]).seconds >= 3600:
        limits["hour_count"] = 0
        limits["hour_reset"] = now

    # 检查限制
    if limits["minute_count"] >= RATE_LIMIT_PER_MINUTE:
        return False
    if limits["hour_count"] >= RATE_LIMIT_PER_HOUR:
        return False

    # 增加计数
    limits["minute_count"] += 1
    limits["hour_count"] += 1

    return True


# ==================== Background Task ====================

async def run_verification_step1(job_id: str, url: str, email: str, fingerprint: Optional[str]):
    """后台执行验证第一步"""
    manager = get_job_manager()
    repo = get_veteran_repository()
    client = get_sheerid_client()

    try:
        # 更新状态：获取退伍军人数据
        manager.update_job(job_id, status=JobStatus.FETCHING_VETERAN, message="正在获取验证数据...")

        # 获取下一个待验证的退伍军人
        veteran = repo.next_pending()
        if not veteran:
            manager.update_job(
                job_id,
                status=JobStatus.FAILED,
                error="没有可用的验证数据"
            )
            return

        veteran_name = f"{veteran.first_name} {veteran.last_name[0]}."
        manager.update_job(
            job_id,
            status=JobStatus.SUBMITTING_STEP1,
            veteran_name=veteran_name,
            message="正在提交验证..."
        )

        # 生成指纹
        if not fingerprint:
            import hashlib
            import time
            fingerprint = hashlib.md5(f"{time.time()}-{job_id}".encode()).hexdigest()

        # 调用 SheerID API
        result = await client.start_verification(veteran, url, email, fingerprint)

        if result.success:
            if result.step == "emailLoop":
                manager.update_job(
                    job_id,
                    status=JobStatus.AWAITING_EMAIL,
                    verification_id=result.verification_id,
                    fingerprint=result.fingerprint or fingerprint,
                    message="验证邮件已发送，请查收邮箱"
                )
            elif result.step == "success":
                repo.mark_used(veteran.id, True)
                manager.update_job(
                    job_id,
                    status=JobStatus.SUCCESS,
                    message="验证成功！"
                )
            else:
                manager.update_job(
                    job_id,
                    status=JobStatus.AWAITING_EMAIL,
                    verification_id=result.verification_id,
                    fingerprint=result.fingerprint or fingerprint,
                    message=result.message or f"状态: {result.step}"
                )
        else:
            repo.mark_used(veteran.id, False)
            manager.update_job(
                job_id,
                status=JobStatus.FAILED,
                error=result.error or "验证失败"
            )

    except Exception as e:
        logger.exception(f"Verification error for job {job_id}")
        manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e)
        )


# ==================== API Endpoints ====================

@router.get("/status")
async def get_service_status():
    """获取服务状态"""
    return {
        "status": "ok",
        "test_mode": is_test_mode(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/verify/submit")
async def submit_verification(
    request: Request,
    data: SubmitVerificationRequest,
    background_tasks: BackgroundTasks,
):
    """
    提交验证请求

    1. 验证 Captcha
    2. 创建任务
    3. 后台执行验证
    4. 返回 job_id
    """
    client_ip = request.client.host if request.client else "unknown"

    # 速率限制检查
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")

    # 验证 Captcha
    await verify_captchas(
        turnstile_token=data.turnstile_token,
        hcaptcha_token=data.hcaptcha_token,
        remote_ip=client_ip,
        require_both=False,
    )

    # 检查并发任务数
    manager = get_job_manager()
    active_count = manager.get_active_jobs_count(client_ip)
    if active_count >= 3:
        raise HTTPException(status_code=429, detail="您有太多进行中的任务，请等待完成")

    # 创建任务
    job = manager.create_job(url=data.url, email=data.email, client_ip=client_ip)

    # 更新状态
    manager.update_job(job.id, status=JobStatus.CAPTCHA_VERIFIED, message="Captcha 验证通过")

    # 后台执行验证
    background_tasks.add_task(
        run_verification_step1,
        job.id,
        data.url,
        data.email,
        data.fingerprint,
    )

    return {
        "success": True,
        "job_id": job.id,
        "message": "任务已创建",
    }


@router.post("/verify/complete")
async def complete_verification(
    request: Request,
    data: CompleteVerificationRequest,
):
    """
    完成验证（提交邮件 token）
    """
    client_ip = request.client.host if request.client else "unknown"

    # 验证 Captcha（可选，step2 也可以要求）
    if data.turnstile_token or data.hcaptcha_token:
        await verify_captchas(
            turnstile_token=data.turnstile_token,
            hcaptcha_token=data.hcaptcha_token,
            remote_ip=client_ip,
            require_both=False,
        )

    manager = get_job_manager()
    job = manager.get_job(data.job_id)

    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    if job.status != JobStatus.AWAITING_EMAIL:
        raise HTTPException(status_code=400, detail=f"任务状态不正确: {job.status.value}")

    if not job.verification_id or not job.fingerprint:
        raise HTTPException(status_code=400, detail="任务数据不完整")

    # 更新状态
    manager.update_job(job.id, status=JobStatus.SUBMITTING_STEP2, message="正在验证 token...")

    # 调用 SheerID API
    client = get_sheerid_client()
    result = await client.complete_verification(
        job.verification_id,
        data.email_token,
        job.fingerprint,
    )

    if result.success and result.step == "success":
        # 标记 veteran 为已使用
        repo = get_veteran_repository()
        if job.veteran_id:
            repo.mark_used(job.veteran_id, True)
        manager.update_job(
            job.id,
            status=JobStatus.SUCCESS,
            message="验证成功！"
        )
        return {
            "success": True,
            "message": "验证成功！",
        }
    else:
        # 标记 veteran 为失败
        repo = get_veteran_repository()
        if job.veteran_id:
            repo.mark_used(job.veteran_id, False)
        manager.update_job(
            job.id,
            status=JobStatus.FAILED,
            error=result.error or "验证失败"
        )
        return {
            "success": False,
            "error": result.error or "验证失败",
        }


@router.get("/verify/job/{job_id}")
async def get_job_status(job_id: str):
    """获取任务状态"""
    manager = get_job_manager()
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    return job.to_dict()


@router.get("/verify/stream/{job_id}")
async def stream_job_events(job_id: str, request: Request):
    """
    SSE 事件流 - 实时推送任务进度
    """
    manager = get_job_manager()
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    queue = manager.subscribe(job_id)

    async def event_generator():
        try:
            # 发送初始状态
            yield format_sse_message("connected", {"job_id": job_id, "status": job.status.value})

            # 如果任务已完成，发送最终状态
            if job.status in {JobStatus.SUCCESS, JobStatus.FAILED, JobStatus.CANCELLED}:
                yield format_sse_message("complete", job.to_dict())
                return

            # 持续监听事件
            while True:
                try:
                    # 等待事件，超时 30 秒发送心跳
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield format_sse_event(event)

                    # 如果是终态，结束流
                    if event.type in {"success", "failed", "cancelled"}:
                        break

                except asyncio.TimeoutError:
                    # 发送心跳
                    yield format_sse_message("heartbeat", {"timestamp": datetime.utcnow().isoformat()})

        except asyncio.CancelledError:
            pass
        finally:
            manager.unsubscribe(job_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
