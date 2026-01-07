import { useState, useEffect } from 'react';
import { useVerification } from './hooks/useVerification';
import InputPanel from './components/InputPanel';
import StatusPanel from './components/StatusPanel';
import { captchaApi } from '../../api';

export default function Verify() {
  const {
    state,
    submitVerification,
    completeVerification,
    reset,
  } = useVerification();

  const [captchaConfig, setCaptchaConfig] = useState({
    turnstileSiteKey: '',
    hcaptchaSiteKey: '',
  });

  useEffect(() => {
    captchaApi.getPublicConfig().then((res) => {
      if (res.data.enabled) {
        setCaptchaConfig({
          turnstileSiteKey: res.data.turnstile_site_key || '',
          hcaptchaSiteKey: res.data.hcaptcha_site_key || '',
        });
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-fuchsia-600/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 py-6 h-screen flex flex-col lg:flex-row gap-6">
        {/* Left Column: Input Panel */}
        <div className="lg:w-5/12 xl:w-1/3 flex flex-col">
          <div className="relative flex-1">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 rounded-2xl blur-xl opacity-20" />

            <div className="relative h-full bg-[#12121a]/90 backdrop-blur-xl rounded-2xl border border-white/10 p-6 shadow-2xl overflow-hidden">
              <InputPanel
                status={state.status}
                onSubmit={submitVerification}
                onComplete={completeVerification}
                onReset={reset}
                turnstileSiteKey={captchaConfig.turnstileSiteKey}
                hcaptchaSiteKey={captchaConfig.hcaptchaSiteKey}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Status Panel */}
        <div className="lg:w-7/12 xl:w-2/3 flex flex-col min-h-[400px] lg:min-h-0">
          <div className="flex-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/5 p-6 overflow-hidden">
            <StatusPanel
              logs={state.logs}
              status={state.status}
              message={state.message}
              error={state.error}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-gray-600 text-xs">
          SheerID Veteran Verification Tool
        </p>
      </div>
    </div>
  );
}
