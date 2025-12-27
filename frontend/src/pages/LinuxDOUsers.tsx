import { useState, useEffect } from 'react';
import { oauthApi } from '../api';
import { Users, Ticket, ChevronLeft, ChevronRight } from 'lucide-react';

interface LinuxDOUser {
  id: number;
  linuxdo_id: number;
  username: string;
  name: string;
  avatar_url: string;
  trust_level: number;
  created_at: string;
  last_login: string;
  codes: { code: string; used_count: number; total_uses: number; is_active: boolean }[];
}

export default function LinuxDOUsers() {
  const [users, setUsers] = useState<LinuxDOUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadUsers();
  }, [page]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await oauthApi.listUsers(page * limit, limit);
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">LinuxDO 用户</h1>
        <div className="text-gray-400">共 {total} 位用户</div>
      </div>

      <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p>暂无用户</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4 text-gray-400 font-medium">用户</th>
                    <th className="text-left p-4 text-gray-400 font-medium">等级</th>
                    <th className="text-left p-4 text-gray-400 font-medium">兑换码</th>
                    <th className="text-left p-4 text-gray-400 font-medium">注册时间</th>
                    <th className="text-left p-4 text-gray-400 font-medium">最后登录</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const usedCodes = user.codes?.filter(c => c.used_count > 0).length || 0;
                    const totalCodes = user.codes?.length || 0;
                    return (
                      <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt={user.username} className="w-10 h-10 rounded-full" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                                {user.username[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-white font-medium">{user.name || user.username}</p>
                              <p className="text-gray-500 text-sm">@{user.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.trust_level >= 3 ? 'bg-emerald-500/20 text-emerald-400' :
                            user.trust_level >= 2 ? 'bg-blue-500/20 text-blue-400' :
                            user.trust_level >= 1 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            Lv.{user.trust_level}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Ticket className="w-4 h-4 text-fuchsia-400" />
                            <span className="text-white">{usedCodes}/{totalCodes}</span>
                            <span className="text-gray-500 text-sm">已使用</span>
                          </div>
                        </td>
                        <td className="p-4 text-gray-400 text-sm">{formatDate(user.created_at)}</td>
                        <td className="p-4 text-gray-400 text-sm">{formatDate(user.last_login)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-white/10">
                <div className="text-gray-400 text-sm">
                  第 {page + 1} / {totalPages} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
