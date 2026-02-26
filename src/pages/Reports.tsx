import { useEffect, useState } from 'react';
import { formatCurrency } from '../lib/utils';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

type FinancialSummary = {
  revenue: { today: number; month: number };
  expenses: { today: number; month: number };
  vat: { rate: number; today: number; month: number };
  cit: { rate: number; today_estimate: number; month_estimate: number; ytd_estimate: number };
  paye: { rate: number; today_estimate: number; month_estimate: number };
  wht?: { today: number; month: number; ytd?: number };
  profit: { today: number; month: number };
};

type RevenueModuleData = {
  formula: string;
  daily_revenue: number;
  monthly_revenue: number;
  revenue_per_product: Array<{ product_id: number; product_name: string; quantity_sold: number; revenue: number }>;
  revenue_per_attendant: Array<{
    attendant_id: number;
    attendant_name: string;
    transactions_today: number;
    revenue_today: number;
    transactions_month: number;
    revenue_month: number;
  }>;
};

export default function Reports() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [attendantPerformance, setAttendantPerformance] = useState<any[]>([]);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [profitByProduct, setProfitByProduct] = useState<any[]>([]);
  const [unsoldProducts, setUnsoldProducts] = useState<any[]>([]);
  const [creditSales, setCreditSales] = useState<any[]>([]);
  const [revenueModule, setRevenueModule] = useState<RevenueModuleData | null>(null);
  const [vatPosition, setVatPosition] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txRes, perfRes, finRes, salesRes, profitProdRes, unsoldRes, creditRes, revenueRes, vatRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/reports/attendant-performance'),
          fetch('/api/reports/financial-summary'),
          fetch('/api/reports/sales-chart'),
          fetch('/api/reports/products/profit-analytics'),
          fetch('/api/reports/products/not-sold-30-days'),
          fetch('/api/reports/credit-sales'),
          fetch('/api/reports/revenue-module'),
          fetch('/api/reports/vat-position'),
        ]);

        const [txData, perfData, finData, salesChart, profitProdData, unsoldData, creditData, revenueData, vatData] = await Promise.all([
          txRes.json(),
          perfRes.json(),
          finRes.json(),
          salesRes.json(),
          profitProdRes.json(),
          unsoldRes.json(),
          creditRes.json(),
          revenueRes.json(),
          vatRes.json(),
        ]);

        setTransactions(txData);
        setAttendantPerformance(perfData);
        setFinancials(finData);
        setSalesData(salesChart);
        setProfitByProduct(profitProdData);
        setUnsoldProducts(unsoldData);
        setCreditSales(creditData);
        setRevenueModule(revenueData);
        setVatPosition(vatData);
      } catch (error) {
        console.error('Error fetching reports:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const downloadReport = (format: 'csv' | 'excel' | 'pdf', type: 'transactions' | 'inventory' | 'tax' | 'profit') => {
    const endpoint = format === 'excel' ? 'excel' : format;
    window.open(`/api/reports/export/${endpoint}?type=${type}`, '_blank');
  };

  if (loading) return <div className="p-8 enter-up">Loading reports...</div>;

  return (
    <div className="space-y-8 enter-up">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Sales, tax, inventory, profit and credit analytics.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadReport('csv', 'transactions')}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </button>
          <button
            onClick={() => downloadReport('excel', 'transactions')}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </button>
          <button
            onClick={() => downloadReport('pdf', 'transactions')}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors"
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4 stagger">
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">Revenue (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.revenue.month || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">Expenses (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.expenses.month || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">VAT Payable (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.vat.month || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">CIT Estimate (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.cit.month_estimate || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">PAYE Estimate (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.paye.month_estimate || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">WHT (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.wht?.month || 0)}</p>
        </div>
        <div className="panel-card p-5 rounded-2xl">
          <p className="text-xs text-gray-500">Profit (Month)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(financials?.profit.month || 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel-card p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales by Attendant (Today)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendantPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" hide />
                <YAxis dataKey="attendant_name" type="category" axisLine={false} tickLine={false} width={120} />
                <Tooltip cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend (Last 7 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Module</h3>
          <p className="text-sm text-gray-500 mt-1">{revenueModule?.formula || 'Revenue = SellingPrice * QuantitySold'}</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/70 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Daily Revenue</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(revenueModule?.daily_revenue || 0)}</p>
          </div>
          <div className="bg-white/70 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Monthly Revenue</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(revenueModule?.monthly_revenue || 0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-gray-100">
          <div className="p-4 border-r border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Revenue Per Product (Month)</h4>
            <div className="max-h-64 overflow-auto space-y-2">
              {(revenueModule?.revenue_per_product || []).slice(0, 10).map((p) => (
                <div key={p.product_id} className="flex justify-between text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white/70">
                  <span className="truncate mr-2">{p.product_name} ({p.quantity_sold})</span>
                  <span className="font-medium">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
              {(revenueModule?.revenue_per_product || []).length === 0 && <p className="text-sm text-gray-500">No product revenue yet.</p>}
            </div>
          </div>
          <div className="p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Revenue Per Attendant</h4>
            <div className="max-h-64 overflow-auto space-y-2">
              {(revenueModule?.revenue_per_attendant || []).map((a) => (
                <div key={a.attendant_id} className="border border-slate-200 rounded-lg px-3 py-2 bg-white/70">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{a.attendant_name}</span>
                    <span>{formatCurrency(a.revenue_month)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Today: {a.transactions_today} tx / {formatCurrency(a.revenue_today)} | Month: {a.transactions_month} tx
                  </div>
                </div>
              ))}
              {(revenueModule?.revenue_per_attendant || []).length === 0 && <p className="text-sm text-gray-500">No attendant revenue yet.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-card rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900">VAT Position (This Month)</h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white/70 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-gray-500">Output VAT</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(vatPosition?.output_vat || 0)}</p>
          </div>
          <div className="bg-white/70 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-gray-500">Input VAT (Total)</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(vatPosition?.input_vat_total || 0)}</p>
          </div>
          <div className="bg-white/70 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-gray-500">Input VAT (Claimable)</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(vatPosition?.input_vat_claimable || 0)}</p>
          </div>
          <div className="bg-white/70 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-gray-500">VAT Payable / Credit</p>
            <p className="text-lg font-semibold text-gray-900">
              {vatPosition?.vat_payable >= 0
                ? formatCurrency(vatPosition?.vat_payable || 0)
                : `Credit ${formatCurrency(vatPosition?.vat_credit || 0)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Profit Per Product</h3>
            <button onClick={() => downloadReport('excel', 'profit')} className="text-xs text-indigo-600">Export</button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Qty Sold</th>
                  <th className="px-4 py-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profitByProduct.slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-right">{p.qty_sold}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(p.realized_profit || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Products Not Sold In 30 Days</h3>
            <button onClick={() => downloadReport('pdf', 'inventory')} className="text-xs text-indigo-600">Export</button>
          </div>
          <div className="p-4 space-y-2 max-h-72 overflow-auto">
            {unsoldProducts.length === 0 && <p className="text-sm text-gray-500">All products have recent sales.</p>}
            {unsoldProducts.slice(0, 20).map((p) => (
              <div key={p.id} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                <span>{p.name}</span>
                <span className="text-gray-500">{p.quantity} in stock</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Credit Sales Tracking</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-right">Paid</th>
                <th className="px-6 py-3 text-right">Balance</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {creditSales.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">{tx.invoice_number}</td>
                  <td className="px-6 py-3">{tx.customer_name}</td>
                  <td className="px-6 py-3 text-right">{formatCurrency(tx.total_amount)}</td>
                  <td className="px-6 py-3 text-right">{formatCurrency(tx.amount_paid)}</td>
                  <td className="px-6 py-3 text-right">{formatCurrency(tx.balance)}</td>
                  <td className="px-6 py-3 capitalize">{tx.status}</td>
                </tr>
              ))}
              {creditSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No credit sales found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions & Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Attendant</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3 text-right">Tax</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 font-mono">#{tx.id}</td>
                  <td className="px-6 py-4 text-xs font-mono text-gray-500">{tx.invoice_number || '-'}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{tx.customer_name}</td>
                  <td className="px-6 py-4 text-gray-500">{tx.attendant_name}</td>
                  <td className="px-6 py-4 text-gray-500">{tx.payment_method}</td>
                  <td className="px-6 py-4 text-right text-gray-500">{formatCurrency(tx.tax_amount || 0)}</td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(tx.total_amount)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">No transactions available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
