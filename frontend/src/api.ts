import axios from 'axios';

// 动态获取 API 基础 URL
// 如果通过 1Panel/nginx 反向代理，使用相对路径 /api
// 否则使用同协议同主机的 14100 端口
const getBaseURL = () => {
  if (typeof window === 'undefined') return '/api';

  // 如果是标准端口（80/443），说明有反向代理，使用相对路径
  const port = window.location.port;
  if (!port || port === '80' || port === '443') {
    return '/api';
  }

  // 否则直接请求后端端口，保持相同协议
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:14100/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
});

// 添加认证头
api.interceptors.request.use((config) => {
  const auth = localStorage.getItem('auth');
  if (auth) {
    config.headers.Authorization = `Basic ${auth}`;
  }
  return config;
});

export interface DashboardStats {
  total_veterans: number;
  pending_veterans: number;
  verified_veterans: number;
  failed_veterans: number;
  total_codes: number;
  active_codes: number;
  total_verifications_today: number;
}

export interface Veteran {
  id: number;
  first_name: string;
  last_name: string;
  birth_date: string;
  discharge_date: string;
  org_name: string;
  status: string;
  email_used?: string;
  verified_at?: string;
  error_message?: string;
}

export interface RedeemCode {
  id: number;
  code: string;
  total_uses: number;
  used_count: number;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/admin/login', { username, password }),
  init: (username: string, password: string) =>
    api.post('/admin/init', { username, password }),
  exists: () => api.get<{ exists: boolean }>('/admin/exists'),
};

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard'),
};

export const veteransApi = {
  list: (skip = 0, limit = 50, status?: string) =>
    api.get('/veterans', { params: { skip, limit, status } }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/veterans/import', formData);
  },
  delete: (id: number) => api.delete(`/veterans/${id}`),
  deleteBatch: (ids: number[]) => api.post('/veterans/delete-batch', ids),
};

export const codesApi = {
  list: (skip = 0, limit = 50) =>
    api.get('/codes', { params: { skip, limit } }),
  generate: (total_uses: number, count: number, expires_days?: number) =>
    api.post('/codes/generate', { total_uses, count, expires_days }),
  delete: (id: number) => api.delete(`/codes/${id}`),
  toggle: (id: number) => api.put(`/codes/${id}/toggle`),
};

export const verifyApi = {
  verify: (code: string, url: string, email: string, udid?: string) =>
    api.post('/verify', { code, url, email, udid }),
  // 获取退伍军人数据（前端直接调用 SheerID 时使用）
  getVeteran: (code: string) =>
    api.post<{
      success: boolean;
      token?: string;  // 验证 token，用于 recordResult
      veteran?: {
        first_name: string;
        last_name: string;
        birth_date: string;
        discharge_date: string;
        org_id: number;
        org_name: string;
        veteran_id: number;
        code_id: number;
      };
      error?: string;
    }>('/verify/get-veteran', { code }),
  // 记录验证结果
  recordResult: (veteran_id: number, code_id: number, success: boolean, email: string, token: string) =>
    api.post('/verify/record-result', { veteran_id, code_id, success, email, token }),
};

export const logsApi = {
  list: (skip = 0, limit = 100) =>
    api.get('/logs', { params: { skip, limit } }),
};

export const oauthApi = {
  getSettings: () => api.get('/admin/oauth/settings'),
  updateSettings: (data: { client_id?: string; client_secret?: string; is_enabled?: boolean; codes_per_user?: number; min_trust_level?: number }) =>
    api.put('/admin/oauth/settings', data),
  getStatus: () => api.get<{ enabled: boolean }>('/oauth/linuxdo/status'),
  getLoginUrl: (redirect_uri: string) =>
    api.get<{ auth_url: string; state: string }>('/oauth/linuxdo/login', { params: { redirect_uri } }),
  callback: (code: string, redirect_uri: string) =>
    api.post('/oauth/linuxdo/callback', null, { params: { code, redirect_uri } }),
  listUsers: (skip = 0, limit = 50) =>
    api.get('/oauth/linuxdo/users', { params: { skip, limit } }),
};

export const proxyApi = {
  getSettings: () => api.get('/admin/proxy/settings'),
  updateSettings: (data: { is_enabled?: boolean; proxy_type?: string; host?: string; port?: number; username?: string; password?: string }) =>
    api.put('/admin/proxy/settings', data),
  test: () => api.post('/admin/proxy/test'),
};

export default api;
