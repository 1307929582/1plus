import { useReducer, useCallback } from 'react';

// API 基础 URL
const getApiBase = () => {
  if (typeof window === 'undefined') return '/api';
  const port = window.location.port;
  if (!port || port === '80' || port === '443') return '/api';
  return `${window.location.protocol}//${window.location.hostname}:14100/api`;
};

const SHEERID_BASE = 'https://services.sheerid.com';

// 状态类型
export type VerificationStatus =
  | 'idle'
  | 'getting_veteran'
  | 'submitting_step1'
  | 'awaiting_email'
  | 'submitting_step2'
  | 'success'
  | 'failed';

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface VeteranData {
  first_name: string;
  last_name: string;
  birth_date: string;
  discharge_date: string;
  org_id: number;
  org_name: string;
}

export interface VerificationState {
  status: VerificationStatus;
  veteran: VeteranData | null;
  token: string | null;  // 后端签名 token
  verificationId: string | null;
  fingerprint: string | null;
  email: string | null;
  message: string | null;
  error: string | null;
  logs: LogEntry[];
}

type Action =
  | { type: 'START_GET_VETERAN' }
  | { type: 'VETERAN_RECEIVED'; payload: { veteran: VeteranData; token: string } }
  | { type: 'START_STEP1'; payload: { email: string } }
  | { type: 'STEP1_SUCCESS'; payload: { verificationId: string; fingerprint: string } }
  | { type: 'START_STEP2' }
  | { type: 'SUCCESS'; payload: { message: string } }
  | { type: 'FAILED'; payload: { error: string } }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'RESET' };

const initialState: VerificationState = {
  status: 'idle',
  veteran: null,
  token: null,
  verificationId: null,
  fingerprint: null,
  email: null,
  message: null,
  error: null,
  logs: [],
};

function reducer(state: VerificationState, action: Action): VerificationState {
  switch (action.type) {
    case 'START_GET_VETERAN':
      return { ...state, status: 'getting_veteran', error: null };
    case 'VETERAN_RECEIVED':
      return { ...state, veteran: action.payload.veteran, token: action.payload.token };
    case 'START_STEP1':
      return { ...state, status: 'submitting_step1', email: action.payload.email };
    case 'STEP1_SUCCESS':
      return {
        ...state,
        status: 'awaiting_email',
        verificationId: action.payload.verificationId,
        fingerprint: action.payload.fingerprint,
      };
    case 'START_STEP2':
      return { ...state, status: 'submitting_step2' };
    case 'SUCCESS':
      return { ...state, status: 'success', message: action.payload.message };
    case 'FAILED':
      return { ...state, status: 'failed', error: action.payload.error };
    case 'ADD_LOG':
      return { ...state, logs: [action.payload, ...state.logs].slice(0, 50) };
    case 'RESET':
      return { ...initialState, logs: state.logs };
    default:
      return state;
  }
}

// 从 URL 提取 verificationId
function extractVerificationId(url: string): string | null {
  const patterns = [
    /verificationId=([a-f0-9]+)/i,
    /\/verification\/([a-f0-9]+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 从邮件链接提取 token
function extractEmailToken(input: string): string {
  const patterns = [
    /[?&]emailToken=(\d+)/,
    /[?&]token=(\d+)/,
    /\/token\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return input.trim();
}

// 获取 UDID 指纹
async function getUdid(): Promise<string> {
  try {
    const resp = await fetch('https://fn.us.fd.sheerid.com/udid/udid.json');
    if (resp.ok) {
      const data = await resp.json();
      if (data.udid) return String(data.udid);
    }
  } catch (e) {
    console.warn('Failed to get UDID:', e);
  }
  // 备用：生成随机指纹
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useVerification() {
  const [state, dispatch] = useReducer(reducer, initialState);

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

  // 上报结果到后端
  const reportResult = useCallback(async (veteran: VeteranData, token: string, email: string, success: boolean, errorMsg?: string) => {
    try {
      await fetch(`${getApiBase()}/public/verify/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...veteran,
          token,  // 必须携带签名 token
          email,
          success,
          error_message: errorMsg,
        }),
      });
    } catch (e) {
      console.warn('Failed to report result:', e);
    }
  }, []);

  // 提交验证（Step 1）
  const submitVerification = useCallback(async (
    url: string,
    email: string,
    turnstileToken: string | null,
    hcaptchaToken: string | null,
  ) => {
    dispatch({ type: 'START_GET_VETERAN' });
    addLog('正在获取验证数据...', 'info');

    try {
      // 1. 从后端获取 veteran 数据
      const veteranResp = await fetch(`${getApiBase()}/public/veteran/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: turnstileToken,
          hcaptcha_token: hcaptchaToken,
        }),
      });

      const veteranData = await veteranResp.json();
      if (!veteranResp.ok) {
        throw new Error(veteranData.detail || '获取数据失败');
      }

      const veteran: VeteranData = veteranData.veteran;
      const backendToken: string = veteranData.token;  // 后端签名 token
      dispatch({ type: 'VETERAN_RECEIVED', payload: { veteran, token: backendToken } });
      addLog('已获取验证数据', 'success');

      // 2. 提取 verificationId
      const verificationId = extractVerificationId(url);
      if (!verificationId) {
        throw new Error('无法从 URL 提取 verificationId');
      }

      // 3. 获取指纹
      dispatch({ type: 'START_STEP1', payload: { email } });
      addLog('正在准备验证...', 'info');
      const fingerprint = await getUdid();

      // 4. 调用 SheerID Step 1: collectMilitaryStatus
      addLog('提交验证请求...', 'info');
      const step1Resp = await fetch(
        `${SHEERID_BASE}/rest/v2/verification/${verificationId}/step/collectMilitaryStatus`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ status: 'VETERAN' }),
        }
      );

      if (!step1Resp.ok) {
        const errText = await step1Resp.text();
        throw new Error(`Step1 失败: ${step1Resp.status} - ${errText}`);
      }

      // 5. 调用 SheerID Step 2: collectInactiveMilitaryPersonalInfo
      addLog('正在验证身份...', 'info');
      const step2Resp = await fetch(
        `${SHEERID_BASE}/rest/v2/verification/${verificationId}/step/collectInactiveMilitaryPersonalInfo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            firstName: veteran.first_name,
            lastName: veteran.last_name,
            birthDate: veteran.birth_date,
            dischargeDate: veteran.discharge_date,
            email: email,
            phoneNumber: '',
            country: 'US',
            locale: 'en-US',
            organization: { id: veteran.org_id, name: veteran.org_name },
            deviceFingerprintHash: fingerprint,
            metadata: { marketConsentValue: false, refererUrl: url },
          }),
        }
      );

      const result = await step2Resp.json();
      const currentStep = result.currentStep || 'unknown';

      if (currentStep === 'emailLoop') {
        dispatch({ type: 'STEP1_SUCCESS', payload: { verificationId, fingerprint } });
        addLog('验证邮件已发送，请查收邮箱', 'success');
      } else if (currentStep === 'success') {
        dispatch({ type: 'SUCCESS', payload: { message: '验证成功！' } });
        addLog('验证成功！', 'success');
        await reportResult(veteran, backendToken, email, true);
      } else if (currentStep === 'error') {
        const errMsg = result.systemErrorMessage || '验证失败';
        throw new Error(errMsg);
      } else {
        // 其他状态也当作需要邮件验证
        dispatch({ type: 'STEP1_SUCCESS', payload: { verificationId, fingerprint } });
        addLog(`状态: ${currentStep}`, 'warning');
      }

    } catch (err: any) {
      addLog(`错误: ${err.message}`, 'error');
      dispatch({ type: 'FAILED', payload: { error: err.message } });
      if (state.veteran && state.token && state.email) {
        await reportResult(state.veteran, state.token, state.email, false, err.message);
      }
    }
  }, [addLog, reportResult, state.veteran, state.token, state.email]);

  // 完成验证（提交邮件 token）
  const completeVerification = useCallback(async (
    emailTokenInput: string,
  ) => {
    if (!state.verificationId || !state.fingerprint || !state.veteran || !state.token || !state.email) {
      addLog('错误: 缺少必要数据', 'error');
      return;
    }

    dispatch({ type: 'START_STEP2' });
    const emailToken = extractEmailToken(emailTokenInput);
    addLog('正在验证邮件码...', 'info');

    try {
      const resp = await fetch(
        `${SHEERID_BASE}/rest/v2/verification/${state.verificationId}/step/emailLoop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            emailToken: emailToken,
            deviceFingerprintHash: state.fingerprint,
          }),
        }
      );

      const result = await resp.json();
      const currentStep = result.currentStep || 'unknown';

      if (currentStep === 'success') {
        dispatch({ type: 'SUCCESS', payload: { message: '验证成功！' } });
        addLog('验证成功！', 'success');
        await reportResult(state.veteran, state.token, state.email, true);
      } else if (currentStep === 'error') {
        const errorIds = result.errorIds || [];
        let errMsg = '验证失败';
        if (errorIds.includes('invalidEmailLoopToken')) {
          errMsg = 'Token 无效，请检查是否正确';
        } else if (errorIds.includes('expiredEmailLoopToken')) {
          errMsg = 'Token 已过期，请重新验证';
        }
        throw new Error(errMsg);
      } else {
        addLog(`状态: ${currentStep}`, 'warning');
      }

    } catch (err: any) {
      addLog(`错误: ${err.message}`, 'error');
      dispatch({ type: 'FAILED', payload: { error: err.message } });
      await reportResult(state.veteran, state.token, state.email, false, err.message);
    }
  }, [state.verificationId, state.fingerprint, state.veteran, state.token, state.email, addLog, reportResult]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    addLog('已重置', 'info');
  }, [addLog]);

  return {
    state,
    submitVerification,
    completeVerification,
    reset,
    addLog,
  };
}
