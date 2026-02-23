import { useEffect, useState } from 'react';
import { formatCurrency } from '../lib/utils';
import { DollarSign, ShoppingBag, AlertTriangle, Package, Activity, Receipt, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type DashboardData = {
  revenue: { today: number; week: number; month: number };
  expenses: { today: number; month: number };
  tax: { rate: number; today: number; month: number };
  profit: { today: number; month: number };
  transactions: { today: number; total: number };
  inventory: { total: number; lowStock: number; outOfStock: number; stockHealthPct: number };
  status: {
    finishingSoon: Array<{ id: number; name: string; quantity: number; min_threshold: number }>;
    outOfStockProducts: Array<{ id: number; name: string }>;
    fastMoving: Array<{ product_id: number; product_name: string; quantity_sold: number }>;
  };
  recentTransactions: Array<{ id: number; customer_name: string; created_at: string; total_amount: number }>;
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardRes, chartRes] = await Promise.all([
          fetch('/api/reports/dashboard'),
          fetch('/api/reports/sales-chart'),
        ]);

        const dashboardData = await dashboardRes.json();
        const chartData = await chartRes.json();

        setStats(dashboardData);
        setSalesData(chartData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="p-8 enter-up">Loading dashboard...</div>;

  const cardClass = 'panel-card p-6 rounded-2xl';

  return (
    <div className="space-y-8 enter-up">
      <div className="panel-card rounded-2xl p-6">
        <h1 className="text-3xl font-bold text-slate-900">Business Command Center</h1>
        <p className="text-slate-600 mt-1">Real-time business performance and inventory alerts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 stagger">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="h-5 w-5 text-green-600" />
            <span className="text-xs text-gray-500">Today</span>
          </div>
          <p className="text-xs text-gray-500">Revenue</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.revenue.today || 0)}</p>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <Receipt className="h-5 w-5 text-rose-600" />
            <span className="text-xs text-gray-500">Month</span>
          </div>
          <p className="text-xs text-gray-500">Expenses</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.expenses.month || 0)}</p>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <Activity className="h-5 w-5 text-cyan-700" />
            <span className="text-xs text-gray-500">Month</span>
          </div>
          <p className="text-xs text-gray-500">Net Profit</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.profit.month || 0)}</p>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <Percent className="h-5 w-5 text-amber-600" />
            <span className="text-xs text-gray-500">{stats?.tax.rate || 0}%</span>
          </div>
          <p className="text-xs text-gray-500">Tax Payable (Month)</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.tax.month || 0)}</p>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <ShoppingBag className="h-5 w-5 text-blue-600" />
            <span className="text-xs text-gray-500">Today</span>
          </div>
          <p className="text-xs text-gray-500">Transactions</p>
          <p className="text-xl font-bold text-gray-900">{stats?.transactions.today || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 panel-card p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Revenue Trend (Last 7 Days)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbe5ee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="total" fill="#0ea5a4" radius={[6, 6, 0, 0]} barSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className={cardClass}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Summary</h3>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Total Products</span><span className="font-semibold">{stats?.inventory.total || 0}</span></div>
              <div className="flex justify-between"><span>Low Stock</span><span className="font-semibold text-amber-700">{stats?.inventory.lowStock || 0}</span></div>
              <div className="flex justify-between"><span>Out of Stock</span><span className="font-semibold text-red-700">{stats?.inventory.outOfStock || 0}</span></div>
              <div className="flex justify-between"><span>Stock Health</span><span className="font-semibold">{stats?.inventory.stockHealthPct || 0}%</span></div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Status</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Finishing Soon</p>
                <div className="space-y-2">
                  {(stats?.status.finishingSoon || []).slice(0, 3).map((p) => (
                    <div key={p.id} className="flex justify-between text-sm bg-amber-50/70 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="truncate mr-2">{p.name}</span>
                      <span className="text-amber-700 font-medium">{p.quantity}</span>
                    </div>
                  ))}
                  {(stats?.status.finishingSoon || []).length === 0 && <p className="text-xs text-gray-400">None</p>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Out of Stock</p>
                <div className="space-y-2">
                  {(stats?.status.outOfStockProducts || []).slice(0, 3).map((p) => (
                    <div key={p.id} className="text-sm text-red-700 truncate bg-red-50/70 border border-red-100 rounded-lg px-2.5 py-1.5">{p.name}</div>
                  ))}
                  {(stats?.status.outOfStockProducts || []).length === 0 && <p className="text-xs text-gray-400">None</p>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Fast Moving</p>
                <div className="space-y-2">
                  {(stats?.status.fastMoving || []).slice(0, 3).map((p) => (
                    <div key={p.product_id} className="flex justify-between text-sm bg-emerald-50/70 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                      <span className="truncate mr-2">{p.product_name}</span>
                      <span className="text-green-700 font-medium">{p.quantity_sold}</span>
                    </div>
                  ))}
                  {(stats?.status.fastMoving || []).length === 0 && <p className="text-xs text-gray-400">No sales yet</p>}
                </div>
              </div>
            </div>
          </div>

          {(stats?.inventory.outOfStock || 0) > 0 && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-800 text-sm flex items-center enter-up">
              <AlertTriangle className="h-4 w-4 mr-2" />
              {stats?.inventory.outOfStock} products are out of stock.
            </div>
          )}
          {(stats?.inventory.outOfStock || 0) === 0 && (stats?.inventory.lowStock || 0) === 0 && (
            <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-green-800 text-sm flex items-center enter-up">
              <Package className="h-4 w-4 mr-2" />
              Inventory health is stable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
