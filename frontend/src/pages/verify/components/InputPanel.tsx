import { useState, useCallback } from 'react';
import { Loader, Send, Mail, ArrowLeft, Sparkles, Zap } from 'lucide-react';
import CaptchaGuard from './CaptchaGuard';

interface InputPanelProps {
  status: string;
  onSubmit: (
    url: string,
    email: string,
    turnstileToken: string | null,
    hcaptchaToken: string | null,
  ) => void;
  onComplete: (
    emailToken: string,
    turnstileToken?: string | null,
    hcaptchaToken?: string | null,
  ) => void;
  onReset: () => void;
  turnstileSiteKey?: string;
  hcaptchaSiteKey?: string;
  inlineAd?: { enabled: boolean; content: string };
}

export default function InputPanel({
  status,
  onSubmit,
  onComplete,
  onReset,
  turnstileSiteKey,
  hcaptchaSiteKey,
  inlineAd,
}: InputPanelProps) {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [emailToken, setEmailToken] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);

  const isStep1 = status === 'idle' || status === 'getting_veteran' || status === 'submitting_step1';
  const isStep2 = status === 'awaiting_email' || status === 'submitting_step2';
  const isComplete = status === 'success' || status === 'failed';
  const isLoading = status === 'getting_veteran' || status === 'submitting_step1' || status === 'submitting_step2';

  const handleCaptchaVerify = useCallback((t: string | null, h: string | null) => {
    setTurnstileToken(t);
    setHcaptchaToken(h);
  }, []);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !email) return;
    if (!turnstileToken && !hcaptchaToken) return;
    onSubmit(url, email, turnstileToken, hcaptchaToken);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailToken) return;
    onComplete(emailToken);
  };

  const handleReset = () => {
    setUrl('');
    setEmail('');
    setEmailToken('');
    setTurnstileToken(null);
    setHcaptchaToken(null);
    onReset();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-3 shadow-lg shadow-violet-500/25">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white mb-1">身份验证</h1>
        <p className="text-gray-500 text-sm">SheerID Veteran Verification</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
          isStep1 || isStep2 || isComplete ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-500'
        }`}>
          1
        </div>
        <div className={`w-10 h-0.5 transition-colors ${
          isStep2 || isComplete ? 'bg-violet-500' : 'bg-white/10'
        }`} />
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
          isStep2 || isComplete ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-500'
        }`}>
          2
        </div>
      </div>

      {/* Forms */}
      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Submit Verification */}
        {isStep1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                验证链接
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                placeholder="https://services.sheerid.com/verify/..."
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                接收邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                placeholder="your@email.com"
                required
                disabled={isLoading}
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

            <button
              type="submit"
              disabled={isLoading || (!turnstileToken && !hcaptchaToken)}
              className="relative w-full py-3.5 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-[length:200%_100%] group-hover:animate-shimmer transition-all" />
              <span className="relative flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    开始验证
                  </>
                )}
              </span>
            </button>

            {inlineAd?.enabled && inlineAd.content && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 xl:hidden">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">赞助</div>
                <div className="text-xs text-gray-300 whitespace-pre-wrap">{inlineAd.content}</div>
              </div>
            )}
          </form>
        )}

        {/* Step 2: Email Token */}
        {isStep2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-cyan-400" />
                <p className="text-cyan-400 text-sm">
                  验证邮件已发送，请查收邮箱
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                邮件验证码
              </label>
              <input
                type="text"
                value={emailToken}
                onChange={(e) => setEmailToken(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                placeholder="输入 6 位数字验证码"
                required
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500">
                从邮件中复制 6 位数字验证码
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
              <button
                type="submit"
                disabled={isLoading || !emailToken}
                className="relative flex-1 py-3 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-500" />
                <span className="relative flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      完成验证
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Complete State */}
        {isComplete && (
          <div className="text-center py-8">
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
            >
              开始新的验证
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
