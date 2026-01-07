import { useState, useEffect } from 'react';
import { proxyApi, captchaApi } from '../api';
import { Save, Eye, EyeOff, Globe, Wifi, WifiOff, CheckCircle, XCircle, Shield } from 'lucide-react';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [showProxyPassword, setShowProxyPassword] = useState(false);

  const [proxySettings, setProxySettings] = useState({
    is_enabled: false,
    proxy_type: 'socks5',
    host: '',
    port: 0,
    username: '',
    password: '',
  });
  const [savingProxy, setSavingProxy] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{success: boolean; ip?: string; city?: string; region?: string; country?: string; org?: string; error?: string} | null>(null);

  const [captchaSettings, setCaptchaSettings] = useState({
    turnstile_site_key: '',
    turnstile_secret: '',
    hcaptcha_site_key: '',
    hcaptcha_secret: '',
    is_enabled: false,
  });
  const [savingCaptcha, setSavingCaptcha] = useState(false);
  const [showTurnstileSecret, setShowTurnstileSecret] = useState(false);
  const [showHcaptchaSecret, setShowHcaptchaSecret] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [proxyRes, captchaRes] = await Promise.all([
        proxyApi.getSettings(),
        captchaApi.getSettings(),
      ]);
      setProxySettings(proxyRes.data);
      setCaptchaSettings(captchaRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProxy = async () => {
    setSavingProxy(true);
    try {
      await proxyApi.updateSettings(proxySettings);
      alert('代理设置已保存');
    } catch (err: any) {
      alert(err.response?.data?.detail || '保存失败');
    } finally {
      setSavingProxy(false);
    }
  };

  const handleTestProxy = async () => {
    setTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await proxyApi.test();
      setProxyTestResult(res.data);
    } catch (err: any) {
      setProxyTestResult({ success: false, error: err.response?.data?.detail || '测试失败' });
    } finally {
      setTestingProxy(false);
    }
  };

  const handleSaveCaptcha = async () => {
    setSavingCaptcha(true);
    try {
      await captchaApi.updateSettings(captchaSettings);
      alert('Captcha 设置已保存');
    } catch (err: any) {
      alert(err.response?.data?.detail || '保存失败');
    } finally {
      setSavingCaptcha(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">系统设置</h1>
      </div>

      <div className="space-y-6">
        {/* Proxy Settings */}
        <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">代理设置</h2>
            <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-full text-sm ${proxySettings.is_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {proxySettings.is_enabled ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {proxySettings.is_enabled ? '已启用' : '已禁用'}
            </div>
          </div>

          <div className="space-y-6 max-w-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setProxySettings({ ...proxySettings, is_enabled: !proxySettings.is_enabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  proxySettings.is_enabled ? 'bg-emerald-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    proxySettings.is_enabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
              <span className="text-gray-300">启用代理</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">代理类型</label>
                <select
                  value={proxySettings.proxy_type}
                  onChange={(e) => setProxySettings({ ...proxySettings, proxy_type: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
                >
                  <option value="socks5" className="bg-[#12121a]">SOCKS5</option>
                  <option value="http" className="bg-[#12121a]">HTTP</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">端口</label>
                <input
                  type="number"
                  value={proxySettings.port || ''}
                  onChange={(e) => setProxySettings({ ...proxySettings, port: parseInt(e.target.value) || 0 })}
                  placeholder="6616"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">主机地址</label>
              <input
                type="text"
                value={proxySettings.host}
                onChange={(e) => setProxySettings({ ...proxySettings, host: e.target.value })}
                placeholder="ep.global.iphalo.com"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">用户名</label>
              <input
                type="text"
                value={proxySettings.username}
                onChange={(e) => setProxySettings({ ...proxySettings, username: e.target.value })}
                placeholder="代理用户名"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">密码</label>
              <div className="relative">
                <input
                  type={showProxyPassword ? 'text' : 'password'}
                  value={proxySettings.password}
                  onChange={(e) => setProxySettings({ ...proxySettings, password: e.target.value })}
                  placeholder="代理密码"
                  className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowProxyPassword(!showProxyPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                >
                  {showProxyPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSaveProxy}
                disabled={savingProxy}
                className="relative flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-500" />
                <Save className="w-4 h-4 relative" />
                <span className="relative">{savingProxy ? '保存中...' : '保存代理设置'}</span>
              </button>

              <button
                onClick={handleTestProxy}
                disabled={testingProxy || !proxySettings.is_enabled}
                className="relative flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50 border border-white/20 hover:bg-white/10 transition-colors"
              >
                <Wifi className="w-4 h-4" />
                <span>{testingProxy ? '测试中...' : '测试连接'}</span>
              </button>
            </div>

            {proxyTestResult && (
              <div className={`p-4 rounded-xl border ${proxyTestResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {proxyTestResult.success ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={proxyTestResult.success ? 'text-emerald-400' : 'text-red-400'}>
                    {proxyTestResult.success ? '连接成功' : '连接失败'}
                  </span>
                </div>
                {proxyTestResult.success ? (
                  <div className="text-sm text-gray-300 space-y-1">
                    <p>IP: <span className="text-cyan-400">{proxyTestResult.ip}</span></p>
                    <p>位置: {proxyTestResult.city}, {proxyTestResult.region}, {proxyTestResult.country}</p>
                    <p>ISP: {proxyTestResult.org}</p>
                  </div>
                ) : (
                  <p className="text-sm text-red-300">{proxyTestResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Captcha Settings */}
        <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Captcha 设置</h2>
            <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-full text-sm ${captchaSettings.is_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {captchaSettings.is_enabled ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {captchaSettings.is_enabled ? '已启用' : '已禁用'}
            </div>
          </div>

          <div className="space-y-6 max-w-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCaptchaSettings({ ...captchaSettings, is_enabled: !captchaSettings.is_enabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  captchaSettings.is_enabled ? 'bg-emerald-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    captchaSettings.is_enabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
              <span className="text-gray-300">启用 Captcha 验证</span>
            </div>

            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <h3 className="text-sm font-medium text-amber-400 mb-4">Cloudflare Turnstile</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Site Key</label>
                  <input
                    type="text"
                    value={captchaSettings.turnstile_site_key}
                    onChange={(e) => setCaptchaSettings({ ...captchaSettings, turnstile_site_key: e.target.value })}
                    placeholder="0x..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Secret Key</label>
                  <div className="relative">
                    <input
                      type={showTurnstileSecret ? 'text' : 'password'}
                      value={captchaSettings.turnstile_secret}
                      onChange={(e) => setCaptchaSettings({ ...captchaSettings, turnstile_secret: e.target.value })}
                      placeholder="Turnstile Secret"
                      className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTurnstileSecret(!showTurnstileSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {showTurnstileSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <h3 className="text-sm font-medium text-cyan-400 mb-4">hCaptcha</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Site Key</label>
                  <input
                    type="text"
                    value={captchaSettings.hcaptcha_site_key}
                    onChange={(e) => setCaptchaSettings({ ...captchaSettings, hcaptcha_site_key: e.target.value })}
                    placeholder="hCaptcha Site Key"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Secret Key</label>
                  <div className="relative">
                    <input
                      type={showHcaptchaSecret ? 'text' : 'password'}
                      value={captchaSettings.hcaptcha_secret}
                      onChange={(e) => setCaptchaSettings({ ...captchaSettings, hcaptcha_secret: e.target.value })}
                      placeholder="hCaptcha Secret"
                      className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHcaptchaSecret(!showHcaptchaSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {showHcaptchaSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleSaveCaptcha}
                disabled={savingCaptcha}
                className="relative flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-orange-500" />
                <Save className="w-4 h-4 relative" />
                <span className="relative">{savingCaptcha ? '保存中...' : '保存 Captcha 设置'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
