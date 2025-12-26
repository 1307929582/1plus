import { useState, useEffect } from 'react';
import { dashboardApi } from '../api';
import type { DashboardStats } from '../api';
import { Users, CheckCircle, XCircle, Clock, Ticket, Activity } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await dashboardApi.getStats();
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const statCards = [
    {
      label: '总退伍军人',
      value: stats?.total_veterans || 0,
      icon: Users,
      color: 'bg-blue-600',
    },
    {
      label: '待验证',
      value: stats?.pending_veterans || 0,
      icon: Clock,
      color: 'bg-yellow-600',
    },
    {
      label: '已验证',
      value: stats?.verified_veterans || 0,
      icon: CheckCircle,
      color: 'bg-green-600',
    },
    {
      label: '验证失败',
      value: stats?.failed_veterans || 0,
      icon: XCircle,
      color: 'bg-red-600',
    },
    {
      label: '有效兑换码',
      value: stats?.active_codes || 0,
      icon: Ticket,
      color: 'bg-purple-600',
    },
    {
      label: '今日验证',
      value: stats?.total_verifications_today || 0,
      icon: Activity,
      color: 'bg-cyan-600',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">{card.label}</p>
                <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">验证进度</h2>
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <div>
              <span className="text-xs font-semibold inline-block text-blue-400">
                完成率
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold inline-block text-blue-400">
                {stats?.total_veterans
                  ? Math.round(
                      ((stats.verified_veterans + stats.failed_veterans) /
                        stats.total_veterans) *
                        100
                    )
                  : 0}
                %
              </span>
            </div>
          </div>
          <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-700">
            <div
              style={{
                width: `${
                  stats?.total_veterans
                    ? (stats.verified_veterans / stats.total_veterans) * 100
                    : 0
                }%`,
              }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
            ></div>
            <div
              style={{
                width: `${
                  stats?.total_veterans
                    ? (stats.failed_veterans / stats.total_veterans) * 100
                    : 0
                }%`,
              }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-500"
            ></div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>成功: {stats?.verified_veterans || 0}</span>
            <span>失败: {stats?.failed_veterans || 0}</span>
            <span>待处理: {stats?.pending_veterans || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
