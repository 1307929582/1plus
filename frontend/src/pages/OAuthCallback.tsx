import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { oauthApi } from '../api';
import { Loader2, CheckCircle, XCircle, Copy, Ticket } from 'lucide-react';

interface UserCode {
  code: string;
  used_count: number;
  total_uses: number;
  is_active: boolean;
}

interface UserInfo {
  id: number;
  linuxdo_id: number;
  username: string;
  name: string;
  avatar_url: string;
  trust_level: number;
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [codes, setCodes] = useState<UserCode[]>([]);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('error');
      setError('缺少授权码');
      return;
    }

    handleCallback(code);
  }, [searchParams]);

  const handleCallback = async (code: string) => {
    try {
      const redirect_uri = `${window.location.origin}/auth/callback`;
      const res = await oauthApi.callback(code, redirect_uri);
      setUser(res.data.user);
      setCodes(res.data.codes);
      setIsNewUser(res.data.is_new_user);
      setStatus('success');

      // 保存用户信息到 localStorage
      localStorage.setItem('linuxdo_user', JSON.stringify(res.data.user));
      localStorage.setItem('linuxdo_codes', JSON.stringify(res.data.codes));
    } catch (err: any) {
      setStatus('error');
      setError(err.response?.data?.detail || '登录失败');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('已复制到剪贴板');
  };

  const goToVerify = () => {
    navigate('/');
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-fuchsia-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">正在登录...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">登录失败</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-600/10 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-600/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">
            {isNewUser ? '欢迎加入！' : '欢迎回来！'}
          </h1>
        </div>

        {user && (
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl mb-6">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.username}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="text-white font-medium">{user.name || user.username}</p>
              <p className="text-gray-400 text-sm">@{user.username}</p>
            </div>
            <div className="ml-auto">
              <span className="px-2 py-1 bg-fuchsia-500/20 text-fuchsia-400 text-xs rounded-full">
                Lv.{user.trust_level}
              </span>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Ticket className="w-5 h-5 text-fuchsia-400" />
            <h2 className="text-lg font-medium text-white">你的兑换码</h2>
          </div>

          {codes.length === 0 ? (
            <p className="text-gray-400 text-center py-4">暂无兑换码</p>
          ) : (
            <div className="space-y-3">
              {codes.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"
                >
                  <div>
                    <code className="text-fuchsia-400 font-mono">{c.code}</code>
                    <p className="text-xs text-gray-500 mt-1">
                      {c.used_count}/{c.total_uses} 次使用
                    </p>
                  </div>
                  <button
                    onClick={() => copyCode(c.code)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={goToVerify}
          className="w-full relative px-6 py-3 text-white font-medium rounded-xl overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500" />
          <span className="relative">去验证</span>
        </button>
      </div>
    </div>
  );
}
