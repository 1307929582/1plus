import { useState, useEffect } from 'react';
import { oauthApi } from '../api';
import { Settings as SettingsIcon, Save, Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [settings, setSettings] = useState({
    client_id: '',
    client_secret: '',
    is_enabled: false,
    codes_per_user: 2,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await oauthApi.getSettings();
      setSettings(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await oauthApi.updateSettings(settings);
      alert('设置已保存');
    } catch (err: any) {
      alert(err.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
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

      <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <SettingsIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">LinuxDO OAuth 设置</h2>
        </div>

        <div className="space-y-6 max-w-xl">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Client ID
            </label>
            <input
              type="text"
              value={settings.client_id}
              onChange={(e) => setSettings({ ...settings, client_id: e.target.value })}
              placeholder="从 LinuxDO Connect 获取"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={settings.client_secret}
                onChange={(e) => setSettings({ ...settings, client_secret: e.target.value })}
                placeholder="从 LinuxDO Connect 获取"
                className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
              >
                {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              每用户发放兑换码数量
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.codes_per_user}
              onChange={(e) => setSettings({ ...settings, codes_per_user: parseInt(e.target.value) || 2 })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettings({ ...settings, is_enabled: !settings.is_enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.is_enabled ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.is_enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
            <span className="text-gray-300">
              {settings.is_enabled ? '已启用' : '已禁用'} LinuxDO 登录
            </span>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="relative flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500" />
              <Save className="w-4 h-4 relative" />
              <span className="relative">{saving ? '保存中...' : '保存设置'}</span>
            </button>
          </div>

          <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <h3 className="text-sm font-medium text-gray-300 mb-2">回调地址 (Redirect URI)</h3>
            <code className="text-sm text-fuchsia-400 bg-fuchsia-500/10 px-3 py-1.5 rounded-lg border border-fuchsia-500/20 block">
              {window.location.origin}/auth/callback
            </code>
            <p className="text-xs text-gray-500 mt-2">
              请在 LinuxDO Connect 中配置此回调地址
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
