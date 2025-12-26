import { useState, useEffect, useRef } from 'react';
import { veteransApi } from '../api';
import type { Veteran } from '../api';
import { Upload, Trash2, RefreshCw, CheckSquare, Square, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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
      pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      email_sent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      failed: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
    const labels: Record<string, string> = {
      pending: '待验证',
      success: '已验证',
      email_sent: '邮件已发',
      failed: '失败',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || 'bg-white/5 text-gray-400 border-white/10'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">退伍军人管理</h1>
        <div className="flex gap-3">
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? '删除中...' : `删除选中 (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => loadVeterans()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl transition-all duration-200"
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
            className="relative flex items-center gap-2 px-4 py-2.5 text-white font-medium rounded-xl overflow-hidden group disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300" />
            <Upload className="w-4 h-4 relative" />
            <span className="relative">{importing ? '导入中...' : '导入 CSV'}</span>
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <select
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="">全部状态</option>
          <option value="pending">待验证</option>
          <option value="success">已验证</option>
          <option value="email_sent">邮件已发</option>
          <option value="failed">失败</option>
        </select>
        <span className="text-gray-400">共 {total} 条记录</span>
        {selected.size > 0 && (
          <span className="text-fuchsia-400">已选中 {selected.size} 条</span>
        )}
      </div>

      <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="px-4 py-4 text-left">
                <button onClick={toggleSelectAll} className="text-gray-400 hover:text-white transition-colors">
                  {selected.size === veterans.length && veterans.length > 0 ? (
                    <CheckSquare className="w-5 h-5 text-fuchsia-400" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">姓名</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">出生日期</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">军种</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">邮箱</th>
              <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fuchsia-500"></div>
                  </div>
                </td>
              </tr>
            ) : veterans.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              veterans.map((v) => (
                <tr key={v.id} className={`transition-colors ${selected.has(v.id) ? 'bg-fuchsia-500/10' : 'hover:bg-white/5'}`}>
                  <td className="px-4 py-4">
                    <button onClick={() => toggleSelect(v.id)} className="text-gray-400 hover:text-white transition-colors">
                      {selected.has(v.id) ? (
                        <CheckSquare className="w-5 h-5 text-fuchsia-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-400">{v.id}</td>
                  <td className="px-4 py-4 text-sm text-white font-medium">
                    {v.first_name.substring(0, 20)}... {v.last_name}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.birth_date}</td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.org_name}</td>
                  <td className="px-4 py-4">{getStatusBadge(v.status)}</td>
                  <td className="px-4 py-4 text-sm text-gray-300">{v.email_used || '-'}</td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
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
        <div className="flex items-center justify-between mt-6 bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/10 p-4">
          <div className="text-sm text-gray-400">
            显示 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm text-gray-300 bg-white/5 rounded-lg border border-white/10">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
