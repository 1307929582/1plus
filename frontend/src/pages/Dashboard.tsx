import { useState, useEffect } from 'react';
import { dashboardApi, historyApi } from '../api';
import type { DashboardStats, VerificationLog } from '../api';
import { Activity, CheckCircle, XCircle, Hash, RotateCcw, Save, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [counterInput, setCounterInput] = useState('');
  const [counterLoading, setCounterLoading] = useState(false);
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    loadStats();
    loadLogs(0);
  }, []);

  const loadLogs = async (page: number) => {
    try {
      const res = await historyApi.list(page * pageSize, pageSize);
      setLogs(res.data.history);
      setLogsTotal(res.data.total);
      setLogsPage(page);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await dashboardApi.getStats();
      setStats(res.data);
      setCounterInput(String(res.data.current_counter));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCounter = async () => {
    if (!confirm('确定要重置计数器为 1 吗？')) return;
    setCounterLoading(true);
    try {
      await dashboardApi.resetCounter();
      await loadStats();
    } catch (err) {
      console.error(err);
    } finally {
      setCounterLoading(false);
    }
  };

  const handleSetCounter = async () => {
    const value = parseInt(counterInput, 10);
    if (isNaN(value) || value < 1) {
      alert('请输入大于等于 1 的数字');
      return;
    }
    setCounterLoading(true);
    try {
      await dashboardApi.setCounter(value);
      await loadStats();
    } catch (err) {
      console.error(err);
    } finally {
      setCounterLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fuchsia-500"></div>
      </div>
    );
  }

  const statCards = [
    {
      label: '总验证次数',
      value: stats?.total_verifications || 0,
      icon: Activity,
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      label: '验证成功',
      value: stats?.success_count || 0,
      icon: CheckCircle,
      gradient: 'from-emerald-500 to-green-500',
    },
    {
      label: '验证失败',
      value: stats?.failed_count || 0,
      icon: XCircle,
      gradient: 'from-rose-500 to-red-500',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-8">仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="relative bg-[#12121a]/80 backdrop-blur-md rounded-2xl p-6 border border-white/10 overflow-hidden transition-all duration-300 hover:border-white/20 hover:scale-[1.02]"
          >
            <div className={`absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-gradient-to-br ${card.gradient} rounded-full opacity-10 blur-2xl`} />
            <div className="flex items-center justify-between relative">
              <div>
                <p className="text-gray-400 text-sm">{card.label}</p>
                <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg shadow-black/20`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}

        {/* 计数器管理卡片 */}
        <div className="relative bg-[#12121a]/80 backdrop-blur-md rounded-2xl p-6 border border-white/10 overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-full opacity-10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm">当前计数器</p>
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 shadow-lg shadow-black/20">
                <Hash className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={counterInput}
                onChange={(e) => setCounterInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-lg font-bold focus:outline-none focus:border-amber-500/50"
                disabled={counterLoading}
              />
              <button
                onClick={handleSetCounter}
                disabled={counterLoading}
                className="p-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                title="保存"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={handleResetCounter}
                disabled={counterLoading}
                className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg transition-colors disabled:opacity-50"
                title="重置为 1"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              下次验证: SUNG × {counterInput || 1} + JEONG
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-[#12121a]/80 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">验证成功率</h2>
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between text-sm">
            <div>
              <span className="text-xs font-semibold inline-block text-fuchsia-400">
                成功率
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold inline-block text-fuchsia-400">
                {stats?.total_verifications && stats.total_verifications > 0
                  ? Math.round((stats.success_count / stats.total_verifications) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
          <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-white/10">
            <div
              style={{
                width: `${
                  stats?.total_verifications
                    ? (stats.success_count / stats.total_verifications) * 100
                    : 0
                }%`,
              }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
            ></div>
            <div
              style={{
                width: `${
                  stats?.total_verifications
                    ? (stats.failed_count / stats.total_verifications) * 100
                    : 0
                }%`,
              }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-500"
            ></div>
          </div>
          <div className="flex justify-between mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              成功: {stats?.success_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              失败: {stats?.failed_count || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 验证日志表格 */}
      <div className="mt-8 bg-[#12121a]/80 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-fuchsia-400" />
            验证日志
          </h2>
          <span className="text-sm text-gray-400">共 {logsTotal} 条</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-white/10">
                <th className="text-left py-3 px-2">邮箱</th>
                <th className="text-left py-3 px-2">IP 地址</th>
                <th className="text-left py-3 px-2">状态</th>
                <th className="text-left py-3 px-2">时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 px-2 text-white">{log.email || '-'}</td>
                  <td className="py-3 px-2 text-gray-400 font-mono text-xs">{log.client_ip || '-'}</td>
                  <td className="py-3 px-2">
                    {log.success ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="w-4 h-4" /> 成功
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400" title={log.error_message || ''}>
                        <XCircle className="w-4 h-4" /> 失败
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-gray-400 text-xs">
                    {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">暂无验证记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {logsTotal > pageSize && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
            <span className="text-sm text-gray-400">
              第 {logsPage + 1} / {Math.ceil(logsTotal / pageSize)} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadLogs(logsPage - 1)}
                disabled={logsPage === 0}
                className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => loadLogs(logsPage + 1)}
                disabled={(logsPage + 1) * pageSize >= logsTotal}
                className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
