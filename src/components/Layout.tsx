import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, ShoppingCart, Package, Receipt, FileBarChart, Settings, LogOut, Search, Bell, Sun, Moon, Monitor } from 'lucide-react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useTheme } from '../context/ThemeContext';
import { useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [shareLabel, setShareLabel] = useState('Share');

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'manager', 'attendant'] },
    { name: 'Sales (POS)', href: '/sales', icon: ShoppingCart, roles: ['admin', 'manager', 'attendant'] },
    { name: 'Inventory', href: '/inventory', icon: Package, roles: ['admin', 'manager'] },
    { name: 'Expenses', href: '/expenses', icon: Receipt, roles: ['admin', 'manager'] },
    { name: 'Reports', href: '/reports', icon: FileBarChart, roles: ['admin', 'manager'] },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navigation.filter(item => user && item.roles.includes(user.role));

  const handleShare = async () => {
    const shareData = { title: 'Smart POS', url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareLabel('Shared');
        setTimeout(() => setShareLabel('Share'), 1400);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setShareLabel('Copied');
        setTimeout(() => setShareLabel('Share'), 1400);
        return;
      }
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (copied) {
        setShareLabel('Copied');
        setTimeout(() => setShareLabel('Share'), 1400);
        return;
      }
      window.prompt('Copy this link manually:', window.location.href);
      setShareLabel('Manual');
      setTimeout(() => setShareLabel('Share'), 1600);
    } catch {
      window.prompt('Copy this link manually:', window.location.href);
      setShareLabel('Manual');
      setTimeout(() => setShareLabel('Share'), 1600);
    }
  };

  const cycleThemeMode = () => {
    const nextMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    setMode(nextMode);
  };

  const ThemeIcon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon;

  return (
    <div className="min-h-screen flex app-shell">
      {/* Sidebar */}
      <div className="hidden md:flex w-72 flex-col fixed h-full border-r shadow-sm app-sidebar">
        <div className="p-6 border-b app-border">
          <h1 className="text-xl font-bold tracking-tight app-text-strong">Smart POS</h1>
          <p className="text-xs app-text-muted mt-1">ERP for SMEs</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-300",
                  isActive 
                    ? "bg-slate-900 text-white shadow-md" 
                    : "app-text-muted hover:bg-slate-100 app-hover-text"
                )}
              >
                <item.icon className={cn("mr-3 h-5 w-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t app-border">
          <div className="flex items-center mb-4 px-2">
            <div className="h-9 w-9 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">
              {user?.full_name.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium app-text-strong">{user?.full_name}</p>
              <p className="text-xs app-text-muted capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-72 pb-20 md:pb-0">
        <header className="hidden md:flex sticky top-0 z-10 backdrop-blur-md border-b px-8 py-4 items-center justify-between app-topbar app-border">
          <div className="relative w-[360px]">
            <Search className="h-4 w-4 app-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice, product, customer..."
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 app-input"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={cycleThemeMode}
              className="h-9 w-9 grid place-items-center rounded-xl border app-border app-sidebar"
              title={`Theme: ${mode}`}
              aria-label={`Theme mode ${mode}. Click to toggle`}
            >
              <ThemeIcon className="h-4 w-4 app-text-muted" />
            </button>
            <button onClick={() => navigate('/settings')} className="chip">Manage</button>
            <button onClick={handleShare} className="chip">{shareLabel}</button>
            <button onClick={() => navigate('/sales')} className="px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl">Create Task</button>
            <button onClick={() => navigate('/notifications')} className="h-9 w-9 grid place-items-center rounded-xl border app-border app-sidebar">
              <Bell className="h-4 w-4 app-text-muted" />
            </button>
          </div>
        </header>
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 backdrop-blur-md border-t px-1 py-2 z-40 shadow-2xl app-mobile-nav app-border">
        <div className="grid grid-cols-6 gap-1">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] transition-all',
                  isActive ? 'text-cyan-700 bg-cyan-50' : 'app-text-muted'
                )}
              >
                <item.icon className="h-4 w-4 mb-1" />
                <span className="truncate max-w-full">{item.name.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
