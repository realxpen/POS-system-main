import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../lib/utils';
import { Plus, Trash2, Edit3, Search, Download } from 'lucide-react';

interface Expense {
  id: number;
  title: string;
  category: string;
  amount: number;
  date: string;
  is_recurring?: number;
  recurring_interval?: string | null;
  vendor?: string | null;
  payment_method?: string | null;
  reference_no?: string | null;
  payee_type?: 'none' | 'individual' | 'company';
  wht_applicable?: number;
  wht_rate?: number;
  wht_amount?: number;
  net_amount?: number;
  notes: string;
}

const defaultForm = {
  title: '',
  category: 'Operational',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  is_recurring: false,
  recurring_interval: 'monthly',
  vendor: '',
  payment_method: 'cash',
  reference_no: '',
  payee_type: 'none',
  wht_applicable: false,
  wht_rate: '',
  notes: '',
};

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [recurringFilter, setRecurringFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  const [formData, setFormData] = useState(defaultForm);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (categoryFilter) q.set('category', categoryFilter);
    if (recurringFilter) q.set('recurring', recurringFilter);
    if (monthFilter) q.set('month', monthFilter);
    return q.toString();
  }, [search, categoryFilter, recurringFilter, monthFilter]);

  const fetchExpenses = async () => {
    const [res, summaryRes] = await Promise.all([
      fetch(`/api/expenses${queryString ? `?${queryString}` : ''}`),
      fetch(`/api/expenses/summary?month=${monthFilter}`),
    ]);
    const [data, summaryData] = await Promise.all([res.json(), summaryRes.json()]);
    setExpenses(data);
    setSummary(summaryData);
  };

  useEffect(() => {
    fetchExpenses();
  }, [queryString, monthFilter]);

  const resetForm = () => {
    setEditing(null);
    setFormData(defaultForm);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setFormData({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      date: expense.date.slice(0, 10),
      is_recurring: Boolean(expense.is_recurring),
      recurring_interval: expense.recurring_interval || 'monthly',
      vendor: expense.vendor || '',
      payment_method: expense.payment_method || 'cash',
      reference_no: expense.reference_no || '',
      payee_type: expense.payee_type || 'none',
      wht_applicable: Boolean(expense.wht_applicable),
      wht_rate: expense.wht_rate != null ? String(expense.wht_rate) : '',
      notes: expense.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editing ? `/api/expenses/${editing.id}` : '/api/expenses';
    const method = editing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Failed to save expense');
      return;
    }

    setIsModalOpen(false);
    resetForm();
    fetchExpenses();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    fetchExpenses();
  };

  const exportCsv = async () => {
    const reportRes = await fetch(`/api/expenses/report?month=${monthFilter}`);
    const report = await reportRes.json();
    const rows: any[] = report.rows || [];
    if (rows.length === 0) {
      alert('No expense data for selected month');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replaceAll('"', '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 enter-up">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses Module</h1>
          <p className="text-gray-500">Add, categorize, track recurring expenses, and run expense reports.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger">
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">Total This Month</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.summary?.total_month || 0)}</p>
        </div>
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Today</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.summary?.total_today || 0)}</p>
        </div>
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">Recurring (Month)</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.summary?.recurring_month || 0)}</p>
        </div>
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">Recurring Entries</p>
          <p className="text-xl font-bold text-gray-900">{summary?.summary?.recurring_count || 0}</p>
        </div>
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">WHT Withheld (Month)</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.summary?.total_wht_month || 0)}</p>
        </div>
        <div className="panel-card rounded-xl p-4">
          <p className="text-xs text-gray-500">Net Vendor Payout (Month)</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary?.summary?.total_net_month || 0)}</p>
        </div>
      </div>

      <div className="panel-card rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative md:col-span-2">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, notes, vendor, reference..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">All Categories</option>
          <option value="Operational">Operational</option>
          <option value="Salary">Salary</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Marketing">Marketing</option>
          <option value="Rent">Rent</option>
          <option value="Utilities">Utilities</option>
          <option value="Other">Other</option>
        </select>
        <select value={recurringFilter} onChange={(e) => setRecurringFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">All</option>
          <option value="yes">Recurring only</option>
          <option value="no">Non-recurring only</option>
        </select>
        <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
      </div>

      <div className="panel-card rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Recurring</th>
              <th className="px-4 py-3">Vendor / Ref</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">WHT</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500">{formatDate(expense.date)}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{expense.title}</td>
                <td className="px-4 py-3">{expense.category}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{expense.is_recurring ? `Yes (${expense.recurring_interval || 'monthly'})` : 'No'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  <div>{expense.vendor || '-'}</div>
                  <div>{expense.reference_no || '-'}</div>
                </td>
                <td className="px-4 py-3 text-xs capitalize text-gray-600">{expense.payment_method || 'cash'}</td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {expense.wht_applicable ? `${expense.wht_rate || 0}% (${formatCurrency(expense.wht_amount || 0)})` : '-'}
                </td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{expense.notes}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(expense.amount)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(expense.net_amount ?? expense.amount)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button onClick={() => openEdit(expense)} className="p-1 text-gray-400 hover:text-indigo-600 transition-colors">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(expense.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                  No expenses recorded for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">{editing ? 'Edit Expense' : 'Add New Expense'}</h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input required type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="e.g. Electricity Bill" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="Operational">Operational</option>
                    <option value="Salary">Salary</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Rent">Rent</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input required type="number" min="0.01" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={formData.payment_method} onChange={e => setFormData({ ...formData, payment_method: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="transfer">Transfer</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor (Optional)</label>
                  <input type="text" value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference No (Optional)</label>
                  <input type="text" value={formData.reference_no} onChange={e => setFormData({ ...formData, reference_no: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payee Type</label>
                  <select value={formData.payee_type} onChange={e => setFormData({ ...formData, payee_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="none">None</option>
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WHT Rate % (optional override)</label>
                  <input type="number" min="0" step="0.01" value={formData.wht_rate} onChange={e => setFormData({ ...formData, wht_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={formData.is_recurring} onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })} />
                  Recurring Expense
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={formData.wht_applicable} onChange={(e) => setFormData({ ...formData, wht_applicable: e.target.checked })} />
                  Apply WHT
                </label>
                <select
                  disabled={!formData.is_recurring}
                  value={formData.recurring_interval}
                  onChange={(e) => setFormData({ ...formData, recurring_interval: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3} />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  {editing ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
