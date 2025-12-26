import { useState, useEffect } from 'react';
import { codesApi } from '../api';
import type { RedeemCode } from '../api';
import { Plus, Trash2, Copy, ToggleLeft, ToggleRight } from 'lucide-react';

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
        <h1 className="text-2xl font-bold text-white">兑换码管理</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          生成兑换码
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">兑换码</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">使用次数</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">过期时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  加载中...
                </td>
              </tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  暂无兑换码
                </td>
              </tr>
            ) : (
              codes.map((code) => (
                <tr key={code.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-blue-400 bg-gray-900 px-2 py-1 rounded">
                        {code.code}
                      </code>
                      <button
                        onClick={() => copyCode(code.code)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {code.used_count} / {code.total_uses}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        code.is_active && code.used_count < code.total_uses
                          ? 'bg-green-900 text-green-300'
                          : 'bg-red-900 text-red-300'
                      }`}
                    >
                      {code.is_active && code.used_count < code.total_uses ? '有效' : '无效'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {new Date(code.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    {code.expires_at ? new Date(code.expires_at).toLocaleString() : '永不过期'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggle(code.id)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {code.is_active ? (
                          <ToggleRight className="w-5 h-5 text-green-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(code.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-6">生成兑换码</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  生成数量
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.count}
                  onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  每码可用次数
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.total_uses}
                  onChange={(e) => setFormData({ ...formData, total_uses: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  有效天数（留空为永不过期）
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.expires_days}
                  onChange={(e) => setFormData({ ...formData, expires_days: e.target.value })}
                  placeholder="例如: 30"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {generating ? '生成中...' : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
