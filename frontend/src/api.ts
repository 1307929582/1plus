import axios from 'axios';

const getBaseURL = () => {
  if (typeof window === 'undefined') return '/api';
  const port = window.location.port;
  if (!port || port === '80' || port === '443') {
    return '/api';
  }
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:14100/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
  const auth = localStorage.getItem('auth');
  if (auth) {
    config.headers.Authorization = `Basic ${auth}`;
  }
  return config;
});

export interface DashboardStats {
  total_verifications: number;
  success_count: number;
  failed_count: number;
  current_counter: number;
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
  resetCounter: () => api.post('/counter/reset'),
  setCounter: (value: number) => api.post('/counter/set', null, { params: { value } }),
};

export const verifyApi = {
  verify: (code: string, url: string, email: string, udid?: string) =>
    api.post('/verify', { code, url, email, udid }),
  getVeteran: (code: string) =>
    api.post<{
      success: boolean;
      token?: string;
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
  recordResult: (veteran_id: number, code_id: number, success: boolean, email: string, token: string) =>
    api.post('/verify/record-result', { veteran_id, code_id, success, email, token }),
};

export const logsApi = {
  list: (skip = 0, limit = 100) =>
    api.get('/logs', { params: { skip, limit } }),
};

export const proxyApi = {
  getSettings: () => api.get('/admin/proxy/settings'),
  updateSettings: (data: { is_enabled?: boolean; proxy_type?: string; host?: string; port?: number; username?: string; password?: string }) =>
    api.put('/admin/proxy/settings', data),
  test: () => api.post('/admin/proxy/test'),
};

export const captchaApi = {
  getSettings: () => api.get<{
    turnstile_site_key: string;
    turnstile_secret: string;
    hcaptcha_site_key: string;
    hcaptcha_secret: string;
    is_enabled: boolean;
  }>('/admin/captcha/settings'),
  updateSettings: (data: {
    turnstile_site_key?: string;
    turnstile_secret?: string;
    hcaptcha_site_key?: string;
    hcaptcha_secret?: string;
    is_enabled?: boolean;
  }) => api.put('/admin/captcha/settings', data),
  getPublicConfig: () => api.get<{
    enabled: boolean;
    turnstile_site_key: string;
    hcaptcha_site_key: string;
  }>('/public/captcha/config'),
};

export default api;
