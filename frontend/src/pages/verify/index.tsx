import { useState, useEffect } from 'react';
import { useVerification } from './hooks/useVerification';
import InputPanel from './components/InputPanel';
import StatusPanel from './components/StatusPanel';
import { captchaApi, siteSettingsApi } from '../../api';
import type { SiteSettingsPublic } from '../../api';
import { X, Megaphone } from 'lucide-react';

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

  const [siteSettings, setSiteSettings] = useState<SiteSettingsPublic>({
    notice: { enabled: false, content: '' },
    left_ad: { enabled: false, content: '' },
    right_ad: { enabled: false, content: '' },
  });
  const [showNotice, setShowNotice] = useState(true);

  useEffect(() => {
    captchaApi.getPublicConfig().then((res) => {
      if (res.data.enabled) {
        setCaptchaConfig({
          turnstileSiteKey: res.data.turnstile_site_key || '',
          hcaptchaSiteKey: res.data.hcaptcha_site_key || '',
        });
      }
    }).catch(() => {});

    siteSettingsApi.getPublic().then((res) => {
      setSiteSettings(res.data);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex flex-col">
      {/* Top Notice Bar */}
      {siteSettings.notice.enabled && siteSettings.notice.content && showNotice && (
        <div className="relative z-50 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 text-white shadow-lg shadow-fuchsia-900/20">
          <div className="container mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm font-medium">
              <div className="p-1 bg-white/10 rounded-lg backdrop-blur-sm">
                <Megaphone className="w-4 h-4" />
              </div>
              <span className="opacity-90">{siteSettings.notice.content}</span>
            </div>
            <button
              onClick={() => setShowNotice(false)}
              aria-label="关闭公告"
              className="p-1 hover:bg-black/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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

      {/* Main content with sidebars */}
      <div className="relative z-10 flex-1 flex gap-4 px-4 py-6">
        {/* Left Ad Sidebar */}
        {siteSettings.left_ad.enabled && siteSettings.left_ad.content && (
          <aside className="hidden xl:block w-56 shrink-0">
            <div className="sticky top-6 h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl bg-[#12121a]/40 backdrop-blur-md border border-white/10 p-4">
              <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Advertisement</div>
              <div className="text-sm text-gray-300 whitespace-pre-wrap">{siteSettings.left_ad.content}</div>
            </div>
          </aside>
        )}

        {/* Center Content */}
        <div className="flex-1 container mx-auto flex flex-col lg:flex-row gap-6 min-w-0">
          {/* Left Column: Input Panel */}
          <div className="lg:w-5/12 xl:w-2/5 flex flex-col">
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
          <div className="lg:w-7/12 xl:w-3/5 flex flex-col min-h-[400px] lg:min-h-0">
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

        {/* Right Ad Sidebar */}
        {siteSettings.right_ad.enabled && siteSettings.right_ad.content && (
          <aside className="hidden xl:block w-56 shrink-0">
            <div className="sticky top-6 h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl bg-[#12121a]/40 backdrop-blur-md border border-white/10 p-4">
              <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Sponsored</div>
              <div className="text-sm text-gray-300 whitespace-pre-wrap">{siteSettings.right_ad.content}</div>
            </div>
          </aside>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 py-4 text-center">
        <p className="text-gray-600 text-xs">
          SheerID Veteran Verification Tool
        </p>
      </div>
    </div>
  );
}
