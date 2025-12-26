import { useState, useEffect } from 'react';
import { codesApi } from '../api';
import type { RedeemCode } from '../api';
import { Plus, Trash2, Copy, ToggleLeft, ToggleRight, X, Sparkles } from 'lucide-react';

export default function Codes() {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [formData, setFormData] = useState({
    count: 1,
    total_uses: 1,
    expires_days: '',
  });

  useEffect(() => {
    loadCodes();
  }, []);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const res = await codesApi.list(0, 100);
      setCodes(res.data.codes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await codesApi.generate(
        formData.total_uses,
        formData.count,
        formData.expires_days ? parseInt(formData.expires_days) : undefined
      );
      alert(`成功生成 ${res.data.count} 个兑换码`);
      setShowModal(false);
      loadCodes();
    } catch (err: any) {
      alert(err.response?.data?.detail || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return;
    try {
      await codesApi.delete(id);
      loadCodes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await codesApi.toggle(id);
      loadCodes();
    } catch (err) {
      console.error(err);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('已复制到剪贴板');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">兑换码管理</h1>
        <button
          onClick={() => setShowModal(true)}
          className="relative flex items-center gap-2 px-4 py-2.5 text-white font-medium rounded-xl overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500" />
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300" />
          <Plus className="w-4 h-4 relative" />
          <span className="relative">生成兑换码</span>
        </button>
      </div>

      <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">兑换码</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">使用次数</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">过期时间</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500"></div>
                  </div>
                </td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  暂无兑换码
                </td>
              </tr>
            ) : (
              codes.map((code) => (
                <tr key={code.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-fuchsia-400 bg-fuchsia-500/10 px-3 py-1.5 rounded-lg border border-fuchsia-500/20">
                        {code.code}
                      </code>
                      <button
                        onClick={() => copyCode(code.code)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    <span className="text-white font-medium">{code.used_count}</span>
                    <span className="text-gray-500"> / {code.total_uses}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        code.is_active && code.used_count < code.total_uses
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {code.is_active && code.used_count < code.total_uses ? '有效' : '无效'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {new Date(code.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {code.expires_at ? new Date(code.expires_at).toLocaleString() : <span className="text-gray-500">永不过期</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(code.id)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                      >
                        {code.is_active ? (
                          <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(code.id)}
                        className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 rounded-2xl blur-xl opacity-30" />
            <div className="relative bg-[#12121a]/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">生成兑换码</h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    生成数量
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.count}
                    onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    每码可用次数
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.total_uses}
                    onChange={(e) => setFormData({ ...formData, total_uses: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    有效天数（留空为永不过期）
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.expires_days}
                    onChange={(e) => setFormData({ ...formData, expires_days: e.target.value })}
                    placeholder="例如: 30"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="relative flex-1 px-4 py-3 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500" />
                  <span className="relative">{generating ? '生成中...' : '生成'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
