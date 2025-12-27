import { useState, useEffect } from 'react';
import { verifyApi, oauthApi } from '../api';
import { CheckCircle, XCircle, Loader, Sparkles, LogIn, Ticket, Copy, Mail } from 'lucide-react';

interface StoredUser {
  username: string;
  name: string;
  avatar_url: string;
  trust_level: number;
}

interface StoredCode {
  code: string;
  used_count: number;
  total_uses: number;
  is_active: boolean;
}

interface VeteranData {
  first_name: string;
  last_name: string;
  birth_date: string;
  discharge_date: string;
  org_id: number;
  org_name: string;
  veteran_id: number;
  code_id: number;
}

const SHEERID_BASE_URL = 'https://services.sheerid.com';

export default function Verify() {
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [userCodes, setUserCodes] = useState<StoredCode[]>([]);

  // 验证状态
  const [step, setStep] = useState<1 | 2>(1);
  const [verificationId, setVerificationId] = useState('');
  const [veteranData, setVeteranData] = useState<VeteranData | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [verifyToken, setVerifyToken] = useState('');  // 后端验证 token

  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    oauthApi.getStatus().then(res => {
      setOauthEnabled(res.data.enabled);
    }).catch(() => {});

    const storedUser = localStorage.getItem('linuxdo_user');
    const storedCodes = localStorage.getItem('linuxdo_codes');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (storedCodes) {
      setUserCodes(JSON.parse(storedCodes));
    }
  }, []);

  const handleLinuxDOLogin = async () => {
    setOauthLoading(true);
    try {
      const redirect_uri = `${window.location.origin}/auth/callback`;
      const res = await oauthApi.getLoginUrl(redirect_uri);
      window.location.href = res.data.auth_url;
    } catch (err: any) {
      alert(err.response?.data?.detail || 'OAuth 登录失败');
      setOauthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('linuxdo_user');
    localStorage.removeItem('linuxdo_codes');
    setUser(null);
    setUserCodes([]);
  };

  const copyCode = (codeStr: string) => {
    navigator.clipboard.writeText(codeStr);
    setCode(codeStr);
    alert('已复制并填入兑换码');
  };

  // 从 URL 提取 verificationId（优先使用查询参数中的）
  const extractVerificationId = (verifyUrl: string): string | null => {
    // 优先从查询参数提取（这是真正有效的 ID）
    const queryMatch = verifyUrl.match(/[?&]verificationId=([a-f0-9]{24})/i);
    if (queryMatch) return queryMatch[1];
    // 降级：从路径提取
    const pathMatch = verifyUrl.match(/\/verify\/([a-f0-9]{24})/i);
    if (pathMatch) return pathMatch[1];
    return null;
  };

  // 获取稳定的设备指纹（优先从 localStorage，其次尝试 SheerID UDID）
  const getStableFingerprint = async (): Promise<string> => {
    const STORAGE_KEY = 'sheerid_device_fingerprint';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 10) {
      return stored;
    }
    let fp = '';
    try {
      const resp = await fetch('https://fn.us.fd.sheerid.com/udid/udid.json', {
        credentials: 'include',
      });
      const data = await resp.json();
      fp = String(data.udid || '');
    } catch {}
    if (!fp || fp.length < 10) {
      fp = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    }
    localStorage.setItem(STORAGE_KEY, fp);
    return fp;
  };

  // 从 token 输入中提取 emailToken
  const extractEmailToken = (input: string): string => {
    // 如果是纯数字，直接返回
    if (/^\d+$/.test(input.trim())) {
      return input.trim();
    }
    // 尝试从 URL 提取
    const patterns = [
      /[?&]emailToken=(\d+)/i,
      /[?&]token=(\d+)/i,
      /\/token\/(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) return match[1];
    }
    return input.trim();
  };

  // 第一步：获取退伍军人数据，提交验证
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    // 直接从 input 获取最新值，避免 state 延迟问题
    const urlInput = document.getElementById('verify-url-input') as HTMLInputElement;
    const currentUrl = urlInput?.value || url;

    let veteran: VeteranData | null = null;
    let backendToken = '';

    try {
      // 1. 从后端获取退伍军人数据
      const veteranRes = await verifyApi.getVeteran(code);
      if (!veteranRes.data.success) {
        throw new Error(veteranRes.data.error || '获取验证数据失败');
      }
      veteran = veteranRes.data.veteran as VeteranData;
      backendToken = veteranRes.data.token || '';
      setVeteranData(veteran);
      setVerifyToken(backendToken);

      // 2. 提取 verificationId
      const verId = extractVerificationId(currentUrl);
      console.log('[DEBUG] Input URL:', currentUrl);
      console.log('[DEBUG] Extracted verificationId:', verId);
      if (!verId) {
        throw new Error('无法从 URL 提取 verificationId');
      }
      setVerificationId(verId);

      // 3. 获取指纹（从用户浏览器）
      const udid = await getStableFingerprint();
      setFingerprint(udid);

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'clientname': 'jslib',
      };

      // 4. Step 1: 提交军人状态
      const statusUrl = `${SHEERID_BASE_URL}/rest/v2/verification/${verId}/step/collectMilitaryStatus`;
      const statusRes = await fetch(statusUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: 'VETERAN' }),
      });
      if (!statusRes.ok) {
        const err = await statusRes.text();
        throw new Error(`状态提交失败: ${err}`);
      }

      // 5. Step 2: 提交个人信息
      const infoUrl = `${SHEERID_BASE_URL}/rest/v2/verification/${verId}/step/collectInactiveMilitaryPersonalInfo`;
      const payload = {
        firstName: veteran.first_name,
        lastName: veteran.last_name,
        birthDate: veteran.birth_date,
        dischargeDate: veteran.discharge_date,
        email: email,
        phoneNumber: '',
        country: 'US',
        locale: 'en-US',
        organization: { id: veteran.org_id, name: veteran.org_name },
        deviceFingerprintHash: udid,
        metadata: { marketConsentValue: false, refererUrl: currentUrl },
      };

      const infoRes = await fetch(infoUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const infoData = await infoRes.json();
      const currentStep = infoData.currentStep || 'unknown';

      if (currentStep === 'emailLoop') {
        setStep(2);
        setResult({
          success: true,
          message: '验证邮件已发送，请查收邮箱并复制验证码',
        });
      } else if (currentStep === 'success') {
        // 直接成功，记录结果
        await verifyApi.recordResult(veteran.veteran_id, veteran.code_id, true, email, backendToken);
        setResult({ success: true, message: '验证成功！' });
        resetForm();
      } else if (currentStep === 'error') {
        const errorMsg = infoData.systemErrorMessage || infoData.errorIds?.join(', ') || '验证失败';
        throw new Error(errorMsg);
      } else {
        setResult({ success: true, message: `状态: ${currentStep}` });
      }
    } catch (err: any) {
      // 错误时恢复 veteran 状态
      if (veteran && backendToken) {
        try {
          await verifyApi.recordResult(veteran.veteran_id, veteran.code_id, false, email, backendToken);
        } catch {
          // 忽略恢复错误
        }
      }
      setResult({
        success: false,
        message: err.message || '验证失败',
      });
    } finally {
      setLoading(false);
    }
  };

  // 第二步：使用邮件 token 完成验证
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const emailToken = extractEmailToken(token);
      if (!emailToken) {
        throw new Error('请输入验证码');
      }

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'clientname': 'jslib',
      };

      // 调用 emailLoop API
      const emailLoopUrl = `${SHEERID_BASE_URL}/rest/v2/verification/${verificationId}/step/emailLoop`;
      const payload = {
        emailToken: emailToken,
        deviceFingerprintHash: fingerprint,
      };

      const res = await fetch(emailLoopUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const currentStep = data.currentStep || 'unknown';

      if (currentStep === 'success') {
        // 记录验证成功
        if (veteranData && verifyToken) {
          await verifyApi.recordResult(veteranData.veteran_id, veteranData.code_id, true, email, verifyToken);
        }
        setResult({ success: true, message: '验证成功！' });
        resetForm();
      } else if (currentStep === 'error') {
        const errorMsg = data.systemErrorMessage || data.errorIds?.join(', ') || '验证失败';
        throw new Error(errorMsg);
      } else {
        setResult({ success: true, message: `状态: ${currentStep}` });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || '验证失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setUrl('');
    setEmail('');
    setToken('');
    setVerificationId('');
    setVeteranData(null);
    setFingerprint('');
    setVerifyToken('');
    if (userCodes.length > 0) {
      const usedCode = code.toUpperCase();
      const updatedCodes = userCodes.map(c =>
        c.code.toUpperCase() === usedCode
          ? { ...c, used_count: c.used_count + 1 }
          : c
      );
      setUserCodes(updatedCodes);
      localStorage.setItem('linuxdo_codes', JSON.stringify(updatedCodes));
    }
  };

  const goBackToStep1 = () => {
    setStep(1);
    setToken('');
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-600/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-fuchsia-600/10 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Main card */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 rounded-2xl blur-xl opacity-30" />

          <div className="relative bg-[#12121a]/90 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-4 shadow-lg shadow-violet-500/25">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">
                身份验证
              </h1>
              <p className="text-gray-400 text-sm">
                SheerID Veteran Verification
              </p>
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-500'}`}>1</div>
                <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-violet-500' : 'bg-white/10'}`} />
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-500'}`}>2</div>
              </div>
            </div>

            {/* LinuxDO Login / User Info */}
            {oauthEnabled && step === 1 && (
              <div className="mb-6">
                {user ? (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3 mb-3">
                      {user.avatar_url && (
                        <img src={user.avatar_url} alt={user.username} className="w-10 h-10 rounded-full" />
                      )}
                      <div className="flex-1">
                        <p className="text-white font-medium">{user.name || user.username}</p>
                        <p className="text-gray-500 text-xs">@{user.username}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        退出
                      </button>
                    </div>
                    {userCodes.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <Ticket className="w-4 h-4" />
                          <span>我的兑换码</span>
                        </div>
                        {userCodes.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                            <div>
                              <code className="text-fuchsia-400 text-sm font-mono">{c.code}</code>
                              <span className="text-gray-500 text-xs ml-2">
                                ({c.used_count}/{c.total_uses})
                              </span>
                            </div>
                            <button
                              onClick={() => copyCode(c.code)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-all"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleLinuxDOLogin}
                    disabled={oauthLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#1a1a2e] hover:bg-[#252540] border border-white/10 rounded-xl text-white transition-colors disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" />
                    {oauthLoading ? '跳转中...' : '使用 LinuxDO 登录获取兑换码'}
                  </button>
                )}
              </div>
            )}

            {/* Step 1 Form */}
            {step === 1 && (
              <form onSubmit={handleStep1} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    兑换码
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                    placeholder="请输入兑换码"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    验证链接
                  </label>
                  <input
                    id="verify-url-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                    placeholder="https://services.sheerid.com/verify/..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    接收邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full py-3.5 mt-2 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-[length:200%_100%] group-hover:animate-shimmer transition-all" />
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        提交中...
                      </>
                    ) : (
                      '第一步：发送验证邮件'
                    )}
                  </span>
                </button>
              </form>
            )}

            {/* Step 2 Form */}
            {step === 2 && (
              <form onSubmit={handleStep2} className="space-y-5">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-cyan-400" />
                    <p className="text-cyan-400 text-sm">
                      验证邮件已发送，请查收邮箱
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    邮件验证码 / 验证链接
                  </label>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all duration-300"
                    placeholder="输入 6 位数字验证码或粘贴完整链接"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    从邮件中复制 6 位数字验证码，或直接粘贴邮件中的验证链接
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={goBackToStep1}
                    className="flex-1 py-3 rounded-xl font-medium text-gray-400 border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    返回
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="relative flex-1 py-3 rounded-xl font-semibold text-white overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-500" />
                    <span className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          验证中...
                        </>
                      ) : (
                        '完成验证'
                      )}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Result */}
            {result && (
              <div
                className={`mt-6 p-4 rounded-xl backdrop-blur-sm ${
                  result.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  {result.success ? (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-5 h-5 text-red-400" />
                    </div>
                  )}
                  <div>
                    <p className={`font-medium ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {result.success ? (step === 2 ? '验证成功！' : '邮件已发送') : '操作失败'}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {result.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6">
          仅供授权用户使用
        </p>
      </div>
    </div>
  );
}
