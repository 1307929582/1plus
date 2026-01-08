import { useState } from 'react';
import { Key, Loader, AlertCircle } from 'lucide-react';

interface TokenModeProps {
  onUrlObtained: (url: string) => void;
}

export default function TokenMode({ onUrlObtained }: TokenModeProps) {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 解析 session JSON
      let accessToken = '';
      try {
        const sessionData = JSON.parse(tokenInput);
        accessToken = sessionData.accessToken;
        if (!accessToken) {
          throw new Error('未找到 accessToken');
        }
      } catch {
        // 如果不是 JSON，尝试直接作为 token
        accessToken = tokenInput.trim();
      }

      // 调用后端 API
      const apiBase = window.location.port === '14000'
        ? `${window.location.protocol}//${window.location.hostname}:14100/api`
        : '/api';

      const response = await fetch(`${apiBase}/public/chatgpt/get-sheerid-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '获取链接失败');
      }

      const result = await response.json();
      const sheeridUrl = result.sheerid_url;

      if (!sheeridUrl) {
        throw new Error('未返回 SheerID 链接');
      }

      // 通知父组件
      onUrlObtained(sheeridUrl);

    } catch (err: any) {
      setError(err.message || '获取链接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Key className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-cyan-400">
            <p className="font-medium mb-1">Token 快速模式</p>
            <p className="text-xs text-cyan-400/70">
              1. 登录 ChatGPT<br />
              2. 访问 <code className="bg-black/20 px-1 rounded">chatgpt.com/api/auth/session</code><br />
              3. 复制完整 JSON 粘贴到下方
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
          onChange={(e) => setTokenInput(e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all font-mono text-xs"
          placeholder='{"user":{"id":"..."},"accessToken":"eyJhbGci..."}'
          rows={6}
          required
          disabled={loading}
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
        disabled={loading || !tokenInput}
        className="relative w-full py-3.5 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-500" />
        <span className="relative flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              获取中...
            </>
          ) : (
            <>
              <Key className="w-5 h-5" />
              获取验证链接
            </>
          )}
        </span>
      </button>
    </form>
  );
}
