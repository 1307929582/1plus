import { useState, useEffect, useRef } from 'react';
import { veteransApi } from '../api';
import type { Veteran } from '../api';
import { Upload, Trash2, RefreshCw, CheckSquare, Square } from 'lucide-react';

export default function Veterans() {
  const [veterans, setVeterans] = useState<Veteran[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadVeterans();
  }, [filter, page]);

  const loadVeterans = async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const res = await veteransApi.list(skip, pageSize, filter || undefined);
      setVeterans(res.data.veterans);
      setTotal(res.data.total);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const res = await veteransApi.import(file);
      alert(res.data.message);
      loadVeterans();
    } catch (err: any) {
      alert(err.response?.data?.detail || '导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return;
    try {
      await veteransApi.delete(id);
      loadVeterans();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条记录？`)) return;

    setDeleting(true);
    try {
      const res = await veteransApi.deleteBatch(Array.from(selected));
      alert(res.data.message);
      loadVeterans();
    } catch (err: any) {
      alert(err.response?.data?.detail || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === veterans.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(veterans.map(v => v.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-900 text-yellow-300',
      success: 'bg-green-900 text-green-300',
      email_sent: 'bg-blue-900 text-blue-300',
      failed: 'bg-red-900 text-red-300',
    };
    const labels: Record<string, string> = {
      pending: '待验证',
      success: '已验证',
      email_sent: '邮件已发',
      failed: '失败',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${styles[status] || 'bg-gray-700 text-gray-300'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">退伍军人管理</h1>
        <div className="flex gap-4">
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? '删除中...' : `删除选中 (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => loadVeterans()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? '导入中...' : '导入 CSV'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <select
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="pending">待验证</option>
          <option value="success">已验证</option>
          <option value="email_sent">邮件已发</option>
          <option value="failed">失败</option>
        </select>
        <span className="ml-4 text-gray-400">共 {total} 条记录</span>
        {selected.size > 0 && (
          <span className="ml-4 text-blue-400">已选中 {selected.size} 条</span>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left">
                <button onClick={toggleSelectAll} className="text-gray-400 hover:text-white">
                  {selected.size === veterans.length && veterans.length > 0 ? (
                    <CheckSquare className="w-5 h-5 text-blue-400" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">姓名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">出生日期</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">军种</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">邮箱</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                  加载中...
                </td>
              </tr>
            ) : veterans.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              veterans.map((v) => (
                <tr key={v.id} className={`hover:bg-gray-750 ${selected.has(v.id) ? 'bg-blue-900/20' : ''}`}>
                  <td className="px-4 py-4">
                    <button onClick={() => toggleSelect(v.id)} className="text-gray-400 hover:text-white">
                      {selected.has(v.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.id}</td>
                  <td className="px-4 py-4 text-sm text-white">
                    {v.first_name.substring(0, 20)}... {v.last_name}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.birth_date}</td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.org_name}</td>
                  <td className="px-4 py-4">{getStatusBadge(v.status)}</td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.email_used || '-'}</td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-400">
            显示 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              首页
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-3 py-1 text-gray-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              末页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
