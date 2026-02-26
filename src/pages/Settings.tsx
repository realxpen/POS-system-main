import { useState, useEffect } from 'react';
import { Trash2, UserPlus, Save, Plus } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface User {
  id: number;
  username: string;
  full_name: string;
  role: string;
  branch_id?: number;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
}

export default function Settings() {
  const { mode, resolvedTheme, setMode } = useTheme();
  const [vatRate, setVatRate] = useState('');
  const [payeRate, setPayeRate] = useState('10');
  const [payeBracketsJson, setPayeBracketsJson] = useState('');
  const [whtIndividualRate, setWhtIndividualRate] = useState('5');
  const [whtCompanyRate, setWhtCompanyRate] = useState('10');
  const [citSmallTurnoverMax, setCitSmallTurnoverMax] = useState('25000000');
  const [citMediumTurnoverMax, setCitMediumTurnoverMax] = useState('100000000');
  const [citSmallRate, setCitSmallRate] = useState('0');
  const [citMediumRate, setCitMediumRate] = useState('20');
  const [citLargeRate, setCitLargeRate] = useState('30');
  const [taxReminderDaysBefore, setTaxReminderDaysBefore] = useState('7');
  const [monthlyVatDueDay, setMonthlyVatDueDay] = useState('21');
  const [monthlyPayeDueDay, setMonthlyPayeDueDay] = useState('10');
  const [monthlyWhtDueDay, setMonthlyWhtDueDay] = useState('21');
  const [annualTaxReturnMonth, setAnnualTaxReturnMonth] = useState('3');
  const [annualTaxReturnDay, setAnnualTaxReturnDay] = useState('31');
  const [citFyEndMonth, setCitFyEndMonth] = useState('12');
  const [citFyEndDay, setCitFyEndDay] = useState('31');
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'attendant', branch_id: 1 });
  const [newBranch, setNewBranch] = useState({ name: '', code: '', address: '' });
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '', phone: '', address: '', contact_person: '' });
  const [newCustomer, setNewCustomer] = useState({ full_name: '', email: '', phone: '', address: '' });
  const [newPo, setNewPo] = useState({
    supplier_id: '',
    product_id: '',
    quantity: '',
    unit_cost: '',
    notes: '',
    vat_charged: true,
    vat_rate: '7.5',
    input_vat_amount: '',
    supplier_vat_invoice_no: '',
    supplier_tin: '',
    is_claimable_input_vat: true,
  });

  const fetchAll = async () => {
    const [taxRes, userRes, branchRes, supplierRes, customerRes, productRes, poRes] = await Promise.all([
      fetch('/api/reports/settings'),
      fetch('/api/users'),
      fetch('/api/branches'),
      fetch('/api/suppliers'),
      fetch('/api/customers'),
      fetch('/api/products'),
      fetch('/api/purchase-orders'),
    ]);
    const [taxData, userData, branchData, supplierData, customerData, productData, poData] = await Promise.all([
      taxRes.json(),
      userRes.json(),
      branchRes.json(),
      supplierRes.json(),
      customerRes.json(),
      productRes.json(),
      poRes.json(),
    ]);
    setVatRate(String(taxData.vat_rate ?? taxData.tax_rate ?? ''));
    setPayeRate(String(taxData.paye_rate ?? '10'));
    setPayeBracketsJson(String(taxData.paye_brackets_json ?? ''));
    setWhtIndividualRate(String(taxData.wht_individual_rate ?? '5'));
    setWhtCompanyRate(String(taxData.wht_company_rate ?? '10'));
    setCitSmallTurnoverMax(String(taxData.cit_small_turnover_max ?? '25000000'));
    setCitMediumTurnoverMax(String(taxData.cit_medium_turnover_max ?? '100000000'));
    setCitSmallRate(String(taxData.cit_small_rate ?? '0'));
    setCitMediumRate(String(taxData.cit_medium_rate ?? '20'));
    setCitLargeRate(String(taxData.cit_large_rate ?? '30'));
    setTaxReminderDaysBefore(String(taxData.tax_reminder_days_before ?? '7'));
    setMonthlyVatDueDay(String(taxData.monthly_vat_due_day ?? '21'));
    setMonthlyPayeDueDay(String(taxData.monthly_paye_due_day ?? '10'));
    setMonthlyWhtDueDay(String(taxData.monthly_wht_due_day ?? '21'));
    setAnnualTaxReturnMonth(String(taxData.annual_tax_return_month ?? '3'));
    setAnnualTaxReturnDay(String(taxData.annual_tax_return_day ?? '31'));
    setCitFyEndMonth(String(taxData.cit_fy_end_month ?? '12'));
    setCitFyEndDay(String(taxData.cit_fy_end_day ?? '31'));
    setUsers(userData);
    setBranches(branchData);
    setSuppliers(supplierData);
    setCustomers(customerData);
    setProducts(productData);
    setPurchaseOrders(poData);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const saveTaxSettings = async () => {
    await fetch('/api/reports/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vat_rate: vatRate,
        tax_rate: vatRate,
        paye_rate: payeRate,
        paye_brackets_json: payeBracketsJson,
        wht_individual_rate: whtIndividualRate,
        wht_company_rate: whtCompanyRate,
        cit_small_turnover_max: citSmallTurnoverMax,
        cit_medium_turnover_max: citMediumTurnoverMax,
        cit_small_rate: citSmallRate,
        cit_medium_rate: citMediumRate,
        cit_large_rate: citLargeRate,
        tax_reminder_days_before: taxReminderDaysBefore,
        monthly_vat_due_day: monthlyVatDueDay,
        monthly_paye_due_day: monthlyPayeDueDay,
        monthly_wht_due_day: monthlyWhtDueDay,
        annual_tax_return_month: annualTaxReturnMonth,
        annual_tax_return_day: annualTaxReturnDay,
        cit_fy_end_month: citFyEndMonth,
        cit_fy_end_day: citFyEndDay,
      }),
    });
    alert('Tax settings updated!');
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      setNewUser({ username: '', password: '', full_name: '', role: 'attendant', branch_id: 1 });
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add user');
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Delete user?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const addBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBranch),
    });
    if (res.ok) {
      setNewBranch({ name: '', code: '', address: '' });
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add branch');
    }
  };

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSupplier),
    });
    if (res.ok) {
      setNewSupplier({ name: '', email: '', phone: '', address: '', contact_person: '' });
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add supplier');
    }
  };

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomer),
    });
    if (res.ok) {
      setNewCustomer({ full_name: '', email: '', phone: '', address: '' });
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add customer');
    }
  };

  const createPo = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: Number(newPo.supplier_id),
        items: [{ product_id: Number(newPo.product_id), quantity: Number(newPo.quantity), unit_cost: Number(newPo.unit_cost) }],
        notes: newPo.notes,
        vat_charged: newPo.vat_charged,
        vat_rate: Number(newPo.vat_rate || 7.5),
        input_vat_amount: newPo.input_vat_amount ? Number(newPo.input_vat_amount) : null,
        supplier_vat_invoice_no: newPo.supplier_vat_invoice_no || null,
        supplier_tin: newPo.supplier_tin || null,
        is_claimable_input_vat: newPo.is_claimable_input_vat,
      }),
    });
    if (res.ok) {
      setNewPo({
        supplier_id: '',
        product_id: '',
        quantity: '',
        unit_cost: '',
        notes: '',
        vat_charged: true,
        vat_rate: '7.5',
        input_vat_amount: '',
        supplier_vat_invoice_no: '',
        supplier_tin: '',
        is_claimable_input_vat: true,
      });
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to create purchase order');
    }
  };

  const receivePo = async (id: number) => {
    const res = await fetch(`/api/purchase-orders/${id}/receive`, { method: 'POST' });
    if (res.ok) fetchAll();
    else {
      const data = await res.json();
      alert(data.error || 'Failed to receive PO');
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">System configuration, users, branches, suppliers and purchase operations.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax & Finance Settings (Nigeria)</h3>
        <p className="text-xs text-gray-500 mb-3">Split tax config for VAT (sales), PAYE estimate (payroll), and CIT estimate (annual taxable profit). Nigeria default VAT is 7.5%.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
            <input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAYE Est. Rate (%)</label>
            <input type="number" value={payeRate} onChange={(e) => setPayeRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WHT Individual Rate (%)</label>
            <input type="number" value={whtIndividualRate} onChange={(e) => setWhtIndividualRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WHT Company Rate (%)</label>
            <input type="number" value={whtCompanyRate} onChange={(e) => setWhtCompanyRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIT Small Rate (%)</label>
            <input type="number" value={citSmallRate} onChange={(e) => setCitSmallRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIT Medium Rate (%)</label>
            <input type="number" value={citMediumRate} onChange={(e) => setCitMediumRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIT Large Rate (%)</label>
            <input type="number" value={citLargeRate} onChange={(e) => setCitLargeRate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="xl:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">PAYE Brackets JSON (Progressive)</label>
            <textarea
              value={payeBracketsJson}
              onChange={(e) => setPayeBracketsJson(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Small Turnover Max (NGN)</label>
            <input type="number" value={citSmallTurnoverMax} onChange={(e) => setCitSmallTurnoverMax(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Medium Turnover Max (NGN)</label>
            <input type="number" value={citMediumTurnoverMax} onChange={(e) => setCitMediumTurnoverMax(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Days Before Due</label>
            <input type="number" value={taxReminderDaysBefore} onChange={(e) => setTaxReminderDaysBefore(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VAT Due Day (Monthly)</label>
            <input type="number" value={monthlyVatDueDay} onChange={(e) => setMonthlyVatDueDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAYE Due Day (Monthly)</label>
            <input type="number" value={monthlyPayeDueDay} onChange={(e) => setMonthlyPayeDueDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WHT Due Day (Monthly)</label>
            <input type="number" value={monthlyWhtDueDay} onChange={(e) => setMonthlyWhtDueDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Annual Return Month</label>
            <input type="number" value={annualTaxReturnMonth} onChange={(e) => setAnnualTaxReturnMonth(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Annual Return Day</label>
            <input type="number" value={annualTaxReturnDay} onChange={(e) => setAnnualTaxReturnDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIT FY End Month</label>
            <input type="number" value={citFyEndMonth} onChange={(e) => setCitFyEndMonth(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CIT FY End Day</label>
            <input type="number" value={citFyEndDay} onChange={(e) => setCitFyEndDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <button onClick={saveTaxSettings} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center h-10">
            <Save className="h-4 w-4 mr-2" />
            Save
          </button>
          <div className="min-w-56">
            <label className="block text-sm font-medium text-gray-700 mb-1">Theme Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'light' | 'dark' | 'system')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="system">System (Default)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Active theme: {resolvedTheme}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">User Management</h3>
          <form onSubmit={addUser} className="grid grid-cols-2 gap-3 mb-4">
            <input required placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input required placeholder="Full Name" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input required type="password" placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="px-3 py-2 text-sm border rounded-lg">
              <option value="attendant">Attendant</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <select value={newUser.branch_id} onChange={(e) => setNewUser({ ...newUser, branch_id: Number(e.target.value) })} className="px-3 py-2 text-sm border rounded-lg">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg flex items-center justify-center">
              <UserPlus className="h-4 w-4 mr-2" />
              Add
            </button>
          </form>
          <div className="space-y-2 max-h-64 overflow-auto">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                <div>{u.full_name} <span className="text-gray-500">({u.role})</span></div>
                <button onClick={() => deleteUser(u.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Branch Management</h3>
          <form onSubmit={addBranch} className="grid grid-cols-2 gap-3 mb-4">
            <input required placeholder="Branch Name" value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input required placeholder="Code" value={newBranch.code} onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Address" value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} className="px-3 py-2 text-sm border rounded-lg col-span-2" />
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg flex items-center justify-center col-span-2">
              <Plus className="h-4 w-4 mr-2" />
              Add Branch
            </button>
          </form>
          <div className="space-y-2 max-h-64 overflow-auto">
            {branches.map((b) => (
              <div key={b.id} className="border rounded-lg px-3 py-2 text-sm">
                {b.name} <span className="text-gray-500">({b.code})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Suppliers</h3>
          <form onSubmit={addSupplier} className="grid grid-cols-2 gap-3 mb-4">
            <input required placeholder="Supplier Name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Contact Person" value={newSupplier.contact_person} onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Phone" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Address" value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} className="px-3 py-2 text-sm border rounded-lg col-span-2" />
            <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg col-span-2">Save Supplier</button>
          </form>
          <div className="space-y-2 max-h-64 overflow-auto">
            {suppliers.map((s) => <div key={s.id} className="border rounded-lg px-3 py-2 text-sm">{s.name}</div>)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customers</h3>
          <form onSubmit={addCustomer} className="grid grid-cols-2 gap-3 mb-4">
            <input required placeholder="Full Name" value={newCustomer.full_name} onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <input placeholder="Address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg col-span-2">Save Customer</button>
          </form>
          <div className="space-y-2 max-h-64 overflow-auto">
            {customers.slice(0, 20).map((c) => <div key={c.id} className="border rounded-lg px-3 py-2 text-sm">{c.full_name}</div>)}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Purchase Orders</h3>
        <form onSubmit={createPo} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <select required value={newPo.supplier_id} onChange={(e) => setNewPo({ ...newPo, supplier_id: e.target.value })} className="px-3 py-2 text-sm border rounded-lg">
            <option value="">Supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select required value={newPo.product_id} onChange={(e) => setNewPo({ ...newPo, product_id: e.target.value })} className="px-3 py-2 text-sm border rounded-lg">
            <option value="">Product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input required type="number" min="1" placeholder="Qty" value={newPo.quantity} onChange={(e) => setNewPo({ ...newPo, quantity: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <input required type="number" min="0" step="0.01" placeholder="Unit Cost" value={newPo.unit_cost} onChange={(e) => setNewPo({ ...newPo, unit_cost: e.target.value })} className="px-3 py-2 text-sm border rounded-lg" />
          <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg">Create PO</button>
          <input placeholder="Notes" value={newPo.notes} onChange={(e) => setNewPo({ ...newPo, notes: e.target.value })} className="px-3 py-2 text-sm border rounded-lg md:col-span-5" />
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={newPo.vat_charged} onChange={(e) => setNewPo({ ...newPo, vat_charged: e.target.checked })} />
            VAT charged by supplier
          </label>
          <label className="md:col-span-3 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={newPo.is_claimable_input_vat} onChange={(e) => setNewPo({ ...newPo, is_claimable_input_vat: e.target.checked })} />
            Claimable Input VAT
          </label>
          <input
            placeholder="VAT Rate %"
            value={newPo.vat_rate}
            onChange={(e) => setNewPo({ ...newPo, vat_rate: e.target.value })}
            className="px-3 py-2 text-sm border rounded-lg"
          />
          <input
            placeholder="Input VAT Amount (optional)"
            value={newPo.input_vat_amount}
            onChange={(e) => setNewPo({ ...newPo, input_vat_amount: e.target.value })}
            className="px-3 py-2 text-sm border rounded-lg"
          />
          <input
            placeholder="Supplier VAT Invoice No"
            value={newPo.supplier_vat_invoice_no}
            onChange={(e) => setNewPo({ ...newPo, supplier_vat_invoice_no: e.target.value })}
            className="px-3 py-2 text-sm border rounded-lg md:col-span-2"
          />
          <input
            placeholder="Supplier TIN"
            value={newPo.supplier_tin}
            onChange={(e) => setNewPo({ ...newPo, supplier_tin: e.target.value })}
            className="px-3 py-2 text-sm border rounded-lg"
          />
        </form>
        <div className="space-y-2 max-h-80 overflow-auto">
          {purchaseOrders.map((po) => (
            <div key={po.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <div>{po.po_number} - {po.supplier_name} <span className="text-gray-500 capitalize">({po.status})</span></div>
              {po.status !== 'received' && (
                <button onClick={() => receivePo(po.id)} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded">
                  Mark Received
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
