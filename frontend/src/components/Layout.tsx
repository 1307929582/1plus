import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Ticket, LogOut, Sparkles } from 'lucide-react';

interface LayoutProps {
  onLogout: () => void;
}

export default function Layout({ onLogout }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: '仪表盘' },
    { path: '/admin/veterans', icon: Users, label: '退伍军人' },
    { path: '/admin/codes', icon: Ticket, label: '兑换码' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-300 flex">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-600/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-600/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-fuchsia-600/5 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '30px 30px'
        }}
      />

      {/* Sidebar */}
      <aside className="relative z-10 w-64 bg-[#12121a]/80 backdrop-blur-lg border-r border-white/10 flex flex-col">
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-fuchsia-500" />
            <h1 className="text-xl font-bold text-white">SheerID</h1>
          </div>
          <p className="text-gray-400 text-sm mt-1">管理后台</p>
        </div>

        <nav className="mt-6 flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <div key={item.path} className="px-4 py-1 relative">
                <Link
                  to={item.path}
                  className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 text-white shadow-lg shadow-violet-500/10'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className={`absolute left-0 w-1 h-6 rounded-r-full bg-fuchsia-500 transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                  <item.icon className={`w-5 h-5 ml-2 mr-3 transition-colors ${isActive ? 'text-fuchsia-400' : 'text-gray-500 group-hover:text-white'}`} />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={onLogout}
            className="flex items-center w-full px-4 py-2.5 text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors group"
          >
            <LogOut className="w-5 h-5 mr-3 text-gray-500 group-hover:text-red-400 transition-colors" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
