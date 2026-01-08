import { useState, useCallback } from 'react';
import { Key, Loader, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import CaptchaGuard from './CaptchaGuard';

interface TokenModeProps {
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  turnstileSiteKey?: string;
  hcaptchaSiteKey?: string;
}

export default function TokenMode({ onSuccess, onError, turnstileSiteKey, hcaptchaSiteKey }: TokenModeProps) {
  const [tokenInput, setTokenInput] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'processing' | 'complete'>('input');
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' }>>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { message, type }]);
  };

  const handleCaptchaVerify = useCallback((t: string | null, h: string | null) => {
    setTurnstileToken(t);
    setHcaptchaToken(h);
  }, []);

  // 自动提取邮箱
  const handleTokenChange = (value: string) => {
    setTokenInput(value);
    try {
      const sessionData = JSON.parse(value);
      if (sessionData.user?.email) {
        setEmail(sessionData.user.email);
      }
    } catch {
      // 不是有效的 JSON，忽略
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setStep('processing');
    setLogs([]);

    try {
      // 1. 解析 token
      addLog('正在解析 Token...', 'info');
      let accessToken = '';
      try {
        const sessionData = JSON.parse(tokenInput);
        accessToken = sessionData.accessToken;
        if (!accessToken) {
          throw new Error('未找到 accessToken');
        }
      } catch {
        accessToken = tokenInput.trim();
      }
      addLog('Token 解析成功', 'success');

      // 2. 获取 SheerID URL（通过后端代理）
      addLog('正在获取验证链接...', 'info');
      const apiBase = window.location.port === '14000'
        ? `${window.location.protocol}//${window.location.hostname}:14100/api`
        : '/api';

      const urlResponse = await fetch(`${apiBase}/public/chatgpt/get-sheerid-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (!urlResponse.ok) {
        const errorData = await urlResponse.json();
        throw new Error(errorData.detail || '获取链接失败');
      }

      const urlResult = await urlResponse.json();
      const sheeridUrl = urlResult.sheerid_url;

      if (!sheeridUrl || typeof sheeridUrl !== 'string') {
        throw new Error('未返回有效的 SheerID 链接');
      }
      addLog('验证链接获取成功', 'success');

      // 3. 获取 veteran 数据
      addLog('正在获取验证数据...', 'info');
      const veteranResponse = await fetch(`${apiBase}/public/veteran/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: turnstileToken,
          hcaptcha_token: hcaptchaToken,
        }),
      });

      if (!veteranResponse.ok) {
        throw new Error('获取验证数据失败');
      }

      const veteranData = await veteranResponse.json();
      const veteran = veteranData.veteran;
      const backendToken = veteranData.token;
      addLog('验证数据获取成功', 'success');

      // 4. 提取 verificationId
      const verificationIdMatch = sheeridUrl.match(/verificationId=([a-f0-9]+)/i);
      if (!verificationIdMatch) {
        throw new Error('无法从 URL 提取 verificationId');
      }
      const verificationId = verificationIdMatch[1];

      // 5. 获取 UDID
      addLog('正在准备验证...', 'info');
      let fingerprint = '';
      try {
        const udidResp = await fetch('https://fn.us.fd.sheerid.com/udid/udid.json');
        if (udidResp.ok) {
          const udidData = await udidResp.json();
          fingerprint = String(udidData.udid || '');
        }
      } catch {
        // 备用指纹
        fingerprint = Math.random().toString(36).slice(2) + Date.now().toString(36);
      }

      // 6. SheerID Step 1: collectMilitaryStatus
      addLog('提交军人状态...', 'info');
      const step1Resp = await fetch(
        `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectMilitaryStatus`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ status: 'VETERAN' }),
        }
      );

      if (!step1Resp.ok) {
        throw new Error('提交军人状态失败');
      }
      addLog('军人状态已提交', 'success');

      // 7. SheerID Step 2: collectInactiveMilitaryPersonalInfo
      addLog('提交个人信息...', 'info');
      const step2Resp = await fetch(
        `https://services.sheerid.com/rest/v2/verification/${verificationId}/step/collectInactiveMilitaryPersonalInfo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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
            metadata: { marketConsentValue: false, refererUrl: sheeridUrl },
          }),
        }
      );

      const result = await step2Resp.json();
      const currentStep = result.currentStep || 'unknown';

      if (currentStep === 'emailLoop') {
        addLog('验证邮件已发送，请查收邮箱', 'success');
        setStep('complete');
        onSuccess('验证邮件已发送，请查收邮箱完成验证');

        // 上报结果
        await fetch(`${apiBase}/public/verify/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...veteran,
            token: backendToken,
            email: email,
            success: true,
            error_message: null,
          }),
        });
      } else if (currentStep === 'success') {
        addLog('验证成功！', 'success');
        setStep('complete');
        onSuccess('验证成功！');

        // 上报结果
        await fetch(`${apiBase}/public/verify/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...veteran,
            token: backendToken,
            email: email,
            success: true,
            error_message: null,
          }),
        });
      } else if (currentStep === 'error') {
        const errMsg = result.systemErrorMessage || '验证失败';
        throw new Error(errMsg);
      } else {
        addLog(`状态: ${currentStep}`, 'success');
        setStep('complete');
        onSuccess(`验证状态: ${currentStep}`);
      }

    } catch (err: any) {
      const errorMsg = err.message || '验证失败';
      setError(errorMsg);
      addLog(`错误: ${errorMsg}`, 'error');
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTokenInput('');
    setEmail('');
    setError('');
    setStep('input');
    setLogs([]);
  };

  return (
    <div className="space-y-4">
      {step === 'input' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-cyan-400">
                <p className="font-medium mb-1">Token 一键模式</p>
                <p className="text-xs text-cyan-400/70">
                  1. 登录 ChatGPT<br />
                  2. 访问 <code className="bg-black/20 px-1 rounded">chatgpt.com/api/auth/session</code><br />
                  3. 复制完整 JSON（邮箱自动提取）<br />
                  4. 完成人机验证，点击提交
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Session Token
            </label>
            <textarea
              value={tokenInput}
              onChange={(e) => handleTokenChange(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all font-mono text-xs"
              placeholder='{"user":{"id":"..."},"accessToken":"eyJhbGci..."}'
              rows={6}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              接收邮箱 {email && <span className="text-xs text-emerald-400">(已自动提取)</span>}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
              placeholder="your@email.com"
              required
              disabled={loading}
            />
          </div>

          {/* Captcha */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              人机验证
            </label>
            <CaptchaGuard
              onVerify={handleCaptchaVerify}
              turnstileSiteKey={turnstileSiteKey}
              hcaptchaSiteKey={hcaptchaSiteKey}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !tokenInput || !email || (!turnstileToken && !hcaptchaToken)}
            className="relative w-full py-3.5 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-500" />
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Key className="w-5 h-5" />
                  一键验证
                </>
              )}
            </span>
          </button>
        </form>
      )}

      {(step === 'processing' || step === 'complete') && (
        <div className="space-y-4">
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl max-h-64 overflow-y-auto">
            <div className="space-y-2">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  {log.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                  {log.type === 'error' && <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                  {log.type === 'info' && <Loader className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0 animate-spin" />}
                  <span className={`${
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error' ? 'text-red-400' :
                    'text-gray-400'
                  }`}>{log.message}</span>
                </div>
              ))}
            </div>
          </div>

          {step === 'complete' && (
            <button
              onClick={handleReset}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
            >
              开始新的验证
            </button>
          )}
        </div>
      )}
    </div>
  );
}
