import { useState, useEffect } from 'react';
import { Trash2, UserPlus, Save, Plus } from 'lucide-react';

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
  const [taxRate, setTaxRate] = useState('');
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
  const [newPo, setNewPo] = useState({ supplier_id: '', product_id: '', quantity: '', unit_cost: '', notes: '' });

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
    setTaxRate(String(taxData.tax_rate || ''));
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

  const saveTaxRate = async () => {
    await fetch('/api/reports/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tax_rate: taxRate }),
    });
    alert('Tax rate updated!');
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
      }),
    });
    if (res.ok) {
      setNewPo({ supplier_id: '', product_id: '', quantity: '', unit_cost: '', notes: '' });
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Settings</h3>
        <p className="text-xs text-gray-500 mb-3">Recommended default for Nigeria POS VAT: 7.5%</p>
        <div className="flex items-end gap-4 max-w-xs">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nigerian VAT/Tax Rate (%)</label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button onClick={saveTaxRate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center">
            <Save className="h-4 w-4 mr-2" />
            Save
          </button>
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
