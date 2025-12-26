import { useState, useEffect } from 'react';
import { authApi } from '../api';
import { Shield } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInit, setIsInit] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    authApi.exists().then(res => {
      setAdminExists(res.data.exists);
      if (!res.data.exists) {
        setIsInit(true);
      }
    }).catch(() => setAdminExists(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isInit) {
        await authApi.init(username, password);
      }
      await authApi.login(username, password);
      onLogin(username, password);
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.detail === 'Admin already exists') {
        setError('管理员已存在，请直接登录');
        setIsInit(false);
        setAdminExists(true);
      } else if (err.response?.status === 401) {
        setError('用户名或密码错误');
      } else {
        setError(err.response?.data?.detail || '登录失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-white mb-2">
            SheerID 验证系统
          </h2>
          <p className="text-gray-400 text-center mb-8">
            {isInit ? '创建管理员账户' : '管理员登录'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="请输入用户名"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : isInit ? '创建账户' : '登录'}
            </button>
          </form>

          {adminExists && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setIsInit(!isInit)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {isInit ? '已有账户？点击登录' : '首次使用？创建管理员'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
