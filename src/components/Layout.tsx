import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, ShoppingCart, Package, Receipt, FileBarChart, Settings, LogOut } from 'lucide-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'manager', 'attendant'] },
    { name: 'Sales (POS)', href: '/sales', icon: ShoppingCart, roles: ['admin', 'manager', 'attendant'] },
    { name: 'Inventory', href: '/inventory', icon: Package, roles: ['admin', 'manager'] },
    { name: 'Expenses', href: '/expenses', icon: Receipt, roles: ['admin', 'manager'] },
    { name: 'Reports', href: '/reports', icon: FileBarChart, roles: ['admin', 'manager'] },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navigation.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="hidden md:flex w-72 flex-col bg-[linear-gradient(180deg,#032236,#0a3e57)] text-white fixed h-full shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold tracking-tight">Smart POS</h1>
          <p className="text-xs text-cyan-100/70 mt-1">Inventory & Accounting</p>
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
                    ? "bg-white/15 text-white shadow-lg shadow-black/15" 
                    : "text-cyan-50/75 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("mr-3 h-5 w-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center mb-4 px-2">
            <div className="h-9 w-9 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold">
              {user?.full_name.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-cyan-100/70 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-red-100 hover:bg-red-500/20 rounded-xl transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-72 pb-20 md:pb-0">
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-2 z-40 shadow-2xl">
        <div className="grid grid-cols-6 gap-1">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] transition-all',
                  isActive ? 'text-cyan-700 bg-cyan-50' : 'text-slate-500'
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
