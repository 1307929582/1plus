import { useReducer, useCallback, useRef, useEffect } from 'react';

// API 基础 URL
const getApiBase = () => {
  if (typeof window === 'undefined') return '/api';
  const port = window.location.port;
  if (!port || port === '80' || port === '443') return '/api';
  return `${window.location.protocol}//${window.location.hostname}:14100/api`;
};

// 状态类型
export type VerificationStatus =
  | 'idle'
  | 'captcha_wait'
  | 'submitting'
  | 'awaiting_email'
  | 'completing'
  | 'success'
  | 'failed';

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface VerificationState {
  status: VerificationStatus;
  jobId: string | null;
  verificationId: string | null;
  veteranName: string | null;
  message: string | null;
  error: string | null;
  logs: LogEntry[];
  testMode: boolean;
}

type Action =
  | { type: 'SET_TEST_MODE'; payload: boolean }
  | { type: 'START_SUBMIT' }
  | { type: 'CAPTCHA_VERIFIED' }
  | { type: 'JOB_CREATED'; payload: { jobId: string } }
  | { type: 'STATUS_UPDATE'; payload: { status: string; message?: string; veteranName?: string; verificationId?: string } }
  | { type: 'SUCCESS'; payload: { message: string } }
  | { type: 'FAILED'; payload: { error: string } }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'RESET' };

const initialState: VerificationState = {
  status: 'idle',
  jobId: null,
  verificationId: null,
  veteranName: null,
  message: null,
  error: null,
  logs: [],
  testMode: false,
};

function reducer(state: VerificationState, action: Action): VerificationState {
  switch (action.type) {
    case 'SET_TEST_MODE':
      return { ...state, testMode: action.payload };

    case 'START_SUBMIT':
      return { ...state, status: 'submitting', error: null, message: null };

    case 'CAPTCHA_VERIFIED':
      return { ...state, status: 'captcha_wait' };

    case 'JOB_CREATED':
      return { ...state, jobId: action.payload.jobId };

    case 'STATUS_UPDATE': {
      const { status, message, veteranName, verificationId } = action.payload;
      let newStatus: VerificationStatus = state.status;

      if (status === 'awaiting_email') newStatus = 'awaiting_email';
      else if (status === 'submitting_step2') newStatus = 'completing';
      else if (status === 'success') newStatus = 'success';
      else if (status === 'failed') newStatus = 'failed';

      return {
        ...state,
        status: newStatus,
        message: message || state.message,
        veteranName: veteranName || state.veteranName,
        verificationId: verificationId || state.verificationId,
      };
    }

    case 'SUCCESS':
      return { ...state, status: 'success', message: action.payload.message };

    case 'FAILED':
      return { ...state, status: 'failed', error: action.payload.error };

    case 'ADD_LOG':
      return { ...state, logs: [action.payload, ...state.logs].slice(0, 50) };

    case 'RESET':
      return { ...initialState, testMode: state.testMode, logs: state.logs };

    default:
      return state;
  }
}

export function useVerification() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 添加日志
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        time: new Date().toLocaleTimeString(),
        message,
        type,
      },
    });
  }, []);

  // 关闭 SSE 连接
  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // 订阅 SSE 事件
  const subscribeToJob = useCallback((jobId: string) => {
    closeEventSource();

    const url = `${getApiBase()}/public/verify/stream/${jobId}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      addLog('已连接到服务器', 'info');
    };

    es.onerror = () => {
      addLog('连接断开', 'warning');
    };

    es.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      addLog(`任务 ${data.job_id} 已创建`, 'info');
    });

    es.addEventListener('captcha_verified', () => {
      addLog('Captcha 验证通过', 'success');
    });

    es.addEventListener('fetching_veteran', () => {
      addLog('正在获取验证数据...', 'info');
    });

    es.addEventListener('submitting_step1', (e) => {
      const data = JSON.parse(e.data);
      if (data.data?.veteran_name) {
        addLog(`正在验证: ${data.data.veteran_name}`, 'info');
        dispatch({ type: 'STATUS_UPDATE', payload: { status: 'submitting', veteranName: data.data.veteran_name } });
      }
    });

    es.addEventListener('awaiting_email', (e) => {
      const data = JSON.parse(e.data);
      addLog('验证邮件已发送，请查收邮箱', 'success');
      dispatch({
        type: 'STATUS_UPDATE',
        payload: {
          status: 'awaiting_email',
          message: data.data?.message,
          verificationId: data.data?.verification_id,
        },
      });
    });

    es.addEventListener('submitting_step2', () => {
      addLog('正在验证 token...', 'info');
    });

    es.addEventListener('success', (e) => {
      const data = JSON.parse(e.data);
      addLog('验证成功！', 'success');
      dispatch({ type: 'SUCCESS', payload: { message: data.data?.message || '验证成功！' } });
      closeEventSource();
    });

    es.addEventListener('failed', (e) => {
      const data = JSON.parse(e.data);
      addLog(`验证失败: ${data.data?.message || '未知错误'}`, 'error');
      dispatch({ type: 'FAILED', payload: { error: data.data?.message || '验证失败' } });
      closeEventSource();
    });

    es.addEventListener('heartbeat', () => {
      // 心跳，保持连接
    });
  }, [addLog, closeEventSource]);

  // 提交验证
  const submitVerification = useCallback(async (
    url: string,
    email: string,
    turnstileToken: string | null,
    hcaptchaToken: string | null,
    fingerprint?: string,
  ) => {
    dispatch({ type: 'START_SUBMIT' });
    addLog('正在提交验证请求...', 'info');

    try {
      const response = await fetch(`${getApiBase()}/public/verify/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          email,
          turnstile_token: turnstileToken,
          hcaptcha_token: hcaptchaToken,
          fingerprint,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || '提交失败');
      }

      if (data.success && data.job_id) {
        dispatch({ type: 'JOB_CREATED', payload: { jobId: data.job_id } });
        addLog(`任务已创建: ${data.job_id}`, 'success');
        subscribeToJob(data.job_id);
      } else {
        throw new Error(data.error || '提交失败');
      }
    } catch (err: any) {
      addLog(`错误: ${err.message}`, 'error');
      dispatch({ type: 'FAILED', payload: { error: err.message } });
    }
  }, [addLog, subscribeToJob]);

  // 完成验证（提交邮件 token）
  const completeVerification = useCallback(async (
    emailToken: string,
    turnstileToken?: string | null,
    hcaptchaToken?: string | null,
  ) => {
    if (!state.jobId) {
      addLog('错误: 没有活跃的任务', 'error');
      return;
    }

    addLog('正在提交验证码...', 'info');

    try {
      const response = await fetch(`${getApiBase()}/public/verify/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: state.jobId,
          email_token: emailToken,
          turnstile_token: turnstileToken,
          hcaptcha_token: hcaptchaToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        addLog('验证成功！', 'success');
        dispatch({ type: 'SUCCESS', payload: { message: data.message || '验证成功！' } });
      } else {
        addLog(`验证失败: ${data.error}`, 'error');
        dispatch({ type: 'FAILED', payload: { error: data.error || '验证失败' } });
      }
    } catch (err: any) {
      addLog(`错误: ${err.message}`, 'error');
      dispatch({ type: 'FAILED', payload: { error: err.message } });
    }
  }, [state.jobId, addLog]);

  // 重置状态
  const reset = useCallback(() => {
    closeEventSource();
    dispatch({ type: 'RESET' });
    addLog('已重置', 'info');
  }, [closeEventSource, addLog]);

  // 设置测试模式
  const setTestMode = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_TEST_MODE', payload: enabled });
    addLog(`测试模式: ${enabled ? '开启' : '关闭'}`, 'info');
  }, [addLog]);

  // 清理
  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  return {
    state,
    submitVerification,
    completeVerification,
    reset,
    setTestMode,
    addLog,
  };
}
