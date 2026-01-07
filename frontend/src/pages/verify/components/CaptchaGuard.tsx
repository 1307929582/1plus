import { useState, useRef, useCallback } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import Turnstile from 'react-turnstile';
import { Shield, RefreshCw, AlertTriangle } from 'lucide-react';

interface CaptchaGuardProps {
  onVerify: (turnstileToken: string | null, hcaptchaToken: string | null) => void;
  turnstileSiteKey?: string;
  hcaptchaSiteKey?: string;
}

export default function CaptchaGuard({
  onVerify,
  turnstileSiteKey = '',
  hcaptchaSiteKey = '',
}: CaptchaGuardProps) {
  const hasTurnstile = !!turnstileSiteKey;
  const hasHcaptcha = !!hcaptchaSiteKey;

  // 默认选择已配置的 provider
  const [activeProvider, setActiveProvider] = useState<'turnstile' | 'hcaptcha'>(
    hasTurnstile ? 'turnstile' : 'hcaptcha'
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const hcaptchaRef = useRef<HCaptcha>(null);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setVerified(true);
    onVerify(token, hcaptchaToken);
  }, [hcaptchaToken, onVerify]);

  const handleHcaptchaVerify = useCallback((token: string) => {
    setHcaptchaToken(token);
    setVerified(true);
    onVerify(turnstileToken, token);
  }, [turnstileToken, onVerify]);

  const handleReset = useCallback(() => {
    setTurnstileToken(null);
    setHcaptchaToken(null);
    setVerified(false);
    hcaptchaRef.current?.resetCaptcha();
    onVerify(null, null);
  }, [onVerify]);

  // 如果没有配置任何 Captcha，显示错误提示
  if (!hasTurnstile && !hasHcaptcha) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 text-sm font-medium">验证服务未配置</p>
            <p className="text-gray-400 text-xs mt-1">请联系管理员配置人机验证</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Provider 切换 */}
      {hasTurnstile && hasHcaptcha && (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveProvider('turnstile')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeProvider === 'turnstile'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            Cloudflare
          </button>
          <button
            type="button"
            onClick={() => setActiveProvider('hcaptcha')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeProvider === 'hcaptcha'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            hCaptcha
          </button>
          {verified && (
            <button
              type="button"
              onClick={handleReset}
              className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              重置
            </button>
          )}
        </div>
      )}

      {/* Captcha Widget */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex justify-center min-h-[80px]">
        {activeProvider === 'turnstile' && hasTurnstile ? (
          <Turnstile
            sitekey={turnstileSiteKey}
            onVerify={handleTurnstileVerify}
            onError={() => setVerified(false)}
            onExpire={() => {
              setTurnstileToken(null);
              setVerified(false);
            }}
            theme="dark"
            size="normal"
          />
        ) : hasHcaptcha ? (
          <HCaptcha
            ref={hcaptchaRef}
            sitekey={hcaptchaSiteKey}
            onVerify={handleHcaptchaVerify}
            onError={() => setVerified(false)}
            onExpire={() => {
              setHcaptchaToken(null);
              setVerified(false);
            }}
            theme="dark"
          />
        ) : (
          <p className="text-gray-500 text-sm">请选择验证方式</p>
        )}
      </div>

      {/* 状态指示 */}
      {verified && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <Shield className="w-4 h-4" />
          <span>人机验证通过</span>
        </div>
      )}
    </div>
  );
}
