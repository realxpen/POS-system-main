import { useEffect, useState } from 'react';
import { formatCurrency } from '../lib/utils';
import { Plus, Search, Edit, Trash2, AlertCircle, Printer, Calculator } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  initial_stock?: number;
  min_threshold: number;
  product_profit?: number;
  stock_status?: 'healthy' | 'low_stock' | 'out_of_stock';
}

interface Material {
  id: number;
  name: string;
  unit: string;
  unit_cost: number;
}

interface CateringIngredientRow {
  material_id: string;
  name: string;
  quantity: string;
  unit_cost: string;
}

interface CateringResult {
  inputs: {
    guests: number;
    portion_factor: 'light' | 'normal' | 'heavy';
    target_margin_pct: number;
  };
  ingredients: Array<{ name: string; quantity: number; unit_cost: number; total_cost: number }>;
  breakdown: {
    ingredient_total: number;
    packaging_total: number;
    labor_total: number;
    transport_total: number;
    fuel_total: number;
    venue_service_total: number;
    total_cost_before_contingency: number;
    contingency_amount: number;
    final_total_cost: number;
    cost_per_plate: number;
  };
  pricing: {
    safe_per_plate: number;
    standard_per_plate: number;
    premium_per_plate: number;
    suggested_per_plate: number;
    total_quote: number;
    expected_profit: number;
  };
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingForm, setCostingForm] = useState({
    item_type: 'product',
    direct_cost: '',
    hours: '',
    hourly_rate: '',
    operating_share: '',
    risk_buffer_pct: '10',
    target_margin_pct: '35',
  });
  const [costingResult, setCostingResult] = useState<any | null>(null);
  const [cateringLoading, setCateringLoading] = useState(false);
  const [cateringResult, setCateringResult] = useState<CateringResult | null>(null);
  const [cateringClient, setCateringClient] = useState('');
  const [cateringEventName, setCateringEventName] = useState('');
  const [cateringDate, setCateringDate] = useState(new Date().toISOString().slice(0, 10));
  const [cateringForm, setCateringForm] = useState({
    guests: '',
    portion_factor: 'normal',
    packaging_per_plate: '',
    labor_total: '',
    transport_total: '',
    fuel_total: '',
    venue_service_total: '',
    contingency_pct: '10',
    target_margin_pct: '35',
  });
  const [cateringIngredients, setCateringIngredients] = useState<CateringIngredientRow[]>([
    { material_id: '', name: '', quantity: '', unit_cost: '' },
  ]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    cost_price: '',
    selling_price: '',
    quantity: '',
    min_threshold: '5'
  });

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      setMaterials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching materials:', error);
      setMaterials([]);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchMaterials();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setEditingProduct(null);
        setFormData({ name: '', sku: '', barcode: '', category: '', cost_price: '', selling_price: '', quantity: '', min_threshold: '5' });
        fetchProducts();
      }
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: product.category,
      cost_price: product.cost_price.toString(),
      selling_price: product.selling_price.toString(),
      quantity: product.quantity.toString(),
      min_threshold: product.min_threshold.toString()
    });
    setIsModalOpen(true);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode || '').toLowerCase().includes(search.toLowerCase())
  );

  const runQuickCosting = async (e: React.FormEvent) => {
    e.preventDefault();
    setCostingLoading(true);
    try {
      const res = await fetch('/api/costing/quick-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costingForm),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to estimate costing');
        return;
      }
      setCostingResult(data);
    } finally {
      setCostingLoading(false);
    }
  };

  const addCateringIngredient = () => {
    setCateringIngredients((prev) => [...prev, { material_id: '', name: '', quantity: '', unit_cost: '' }]);
  };

  const removeCateringIngredient = (index: number) => {
    setCateringIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCateringIngredient = (index: number, patch: Partial<CateringIngredientRow>) => {
    setCateringIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const selectMaterialForIngredient = (index: number, materialId: string) => {
    if (!materialId) {
      updateCateringIngredient(index, { material_id: '', name: '', unit_cost: '' });
      return;
    }
    const selected = materials.find((m) => String(m.id) === materialId);
    updateCateringIngredient(index, {
      material_id: materialId,
      name: selected?.name || '',
      unit_cost: selected ? String(selected.unit_cost ?? 0) : '',
    });
  };

  const runCateringCosting = async (e: React.FormEvent) => {
    e.preventDefault();
    setCateringLoading(true);
    try {
      const payload = {
        ...cateringForm,
        ingredients: cateringIngredients
          .filter((row) => row.name.trim() && Number(row.quantity || 0) > 0)
          .map((row) => ({
            name: row.name.trim(),
            quantity: Number(row.quantity || 0),
            unit_cost: Number(row.unit_cost || 0),
          })),
      };
      const res = await fetch('/api/costing/catering-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to calculate catering estimate');
        return;
      }
      setCateringResult(data);
    } finally {
      setCateringLoading(false);
    }
  };

  const printCateringQuote = () => {
    if (!cateringResult) return;
    const popup = window.open('', '_blank', 'width=900,height=1000');
    if (!popup) return;
    const rows = cateringResult.ingredients
      .map((i) => `<tr><td>${i.name}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${formatCurrency(i.unit_cost)}</td><td style="text-align:right">${formatCurrency(i.total_cost)}</td></tr>`)
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Catering Quote</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1, h2 { margin: 0 0 8px; }
            .muted { color: #6b7280; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; }
            th { background: #f3f4f6; text-align: left; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 16px; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h1>Catering Quote Summary</h1>
          <p class="muted">Client: ${cateringClient || 'N/A'} | Event: ${cateringEventName || 'N/A'} | Date: ${cateringDate}</p>
          <table>
            <thead><tr><th>Ingredient</th><th class="right">Qty</th><th class="right">Unit Cost</th><th class="right">Total</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No ingredients listed</td></tr>'}</tbody>
          </table>
          <div class="grid">
            <div class="card">Guests: <b>${cateringResult.inputs.guests}</b></div>
            <div class="card">Cost / Plate: <b>${formatCurrency(cateringResult.breakdown.cost_per_plate)}</b></div>
            <div class="card">Suggested / Plate: <b>${formatCurrency(cateringResult.pricing.suggested_per_plate)}</b></div>
            <div class="card">Total Quote: <b>${formatCurrency(cateringResult.pricing.total_quote)}</b></div>
            <div class="card">Final Total Cost: <b>${formatCurrency(cateringResult.breakdown.final_total_cost)}</b></div>
            <div class="card">Expected Profit: <b>${formatCurrency(cateringResult.pricing.expected_profit)}</b></div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500">Manage your products, stock levels, and pricing.</p>
        </div>
        <button 
          onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Product
        </button>
      </div>

      <div className="panel-card rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-gray-900">Quick Costing Wizard (Unknown Product/Service)</h3>
        <p className="text-sm text-gray-500 mt-1">Use fallback costing when exact recipe/material details are not ready.</p>
        <form onSubmit={runQuickCosting} className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select
              value={costingForm.item_type}
              onChange={(e) => setCostingForm({ ...costingForm, item_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Direct Cost (NGN)</label>
            <input type="number" step="0.01" value={costingForm.direct_cost} onChange={(e) => setCostingForm({ ...costingForm, direct_cost: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hours Spent</label>
            <input type="number" step="0.01" value={costingForm.hours} onChange={(e) => setCostingForm({ ...costingForm, hours: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hourly Rate (NGN)</label>
            <input type="number" step="0.01" value={costingForm.hourly_rate} onChange={(e) => setCostingForm({ ...costingForm, hourly_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Operating Share (NGN)</label>
            <input type="number" step="0.01" value={costingForm.operating_share} onChange={(e) => setCostingForm({ ...costingForm, operating_share: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Risk Buffer %</label>
            <input type="number" step="0.01" value={costingForm.risk_buffer_pct} onChange={(e) => setCostingForm({ ...costingForm, risk_buffer_pct: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Target Margin %</label>
            <input type="number" step="0.01" value={costingForm.target_margin_pct} onChange={(e) => setCostingForm({ ...costingForm, target_margin_pct: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={costingLoading} className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-400">
              {costingLoading ? 'Calculating...' : 'Calculate Price'}
            </button>
          </div>
        </form>
        {costingResult && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">Base Cost</p>
              <p className="font-semibold text-gray-900">{formatCurrency(costingResult.breakdown.base_cost || 0)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">Safe Price</p>
              <p className="font-semibold text-emerald-700">{formatCurrency(costingResult.pricing.safe || 0)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">Standard Price</p>
              <p className="font-semibold text-indigo-700">{formatCurrency(costingResult.pricing.standard || 0)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">Premium Price</p>
              <p className="font-semibold text-violet-700">{formatCurrency(costingResult.pricing.premium || 0)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">By Target Margin</p>
              <p className="font-semibold text-cyan-700">{formatCurrency(costingResult.pricing.suggested_by_target_margin || 0)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="panel-card rounded-2xl p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Catering Cost Calculator
            </h3>
            <p className="text-sm text-gray-500 mt-1">Per plate + event quote for weddings, parties, and bulk catering.</p>
          </div>
          <button
            type="button"
            onClick={printCateringQuote}
            disabled={!cateringResult}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print Quote
          </button>
        </div>

        <form onSubmit={runCateringCosting} className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input placeholder="Client name (optional)" value={cateringClient} onChange={(e) => setCateringClient(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Event name (optional)" value={cateringEventName} onChange={(e) => setCateringEventName(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="date" value={cateringDate} onChange={(e) => setCateringDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Guests" type="number" min="1" value={cateringForm.guests} onChange={(e) => setCateringForm({ ...cateringForm, guests: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <select value={cateringForm.portion_factor} onChange={(e) => setCateringForm({ ...cateringForm, portion_factor: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="light">Light</option>
            <option value="normal">Normal</option>
            <option value="heavy">Heavy</option>
          </select>
          <input placeholder="Packaging / plate" type="number" step="0.01" value={cateringForm.packaging_per_plate} onChange={(e) => setCateringForm({ ...cateringForm, packaging_per_plate: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Labor total" type="number" step="0.01" value={cateringForm.labor_total} onChange={(e) => setCateringForm({ ...cateringForm, labor_total: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Transport / logistics" type="number" step="0.01" value={cateringForm.transport_total} onChange={(e) => setCateringForm({ ...cateringForm, transport_total: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Fuel / gas" type="number" step="0.01" value={cateringForm.fuel_total} onChange={(e) => setCateringForm({ ...cateringForm, fuel_total: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Venue / service cost" type="number" step="0.01" value={cateringForm.venue_service_total} onChange={(e) => setCateringForm({ ...cateringForm, venue_service_total: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Contingency %" type="number" step="0.01" value={cateringForm.contingency_pct} onChange={(e) => setCateringForm({ ...cateringForm, contingency_pct: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input placeholder="Target margin %" type="number" step="0.01" value={cateringForm.target_margin_pct} onChange={(e) => setCateringForm({ ...cateringForm, target_margin_pct: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <button type="submit" disabled={cateringLoading} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-400">
            {cateringLoading ? 'Calculating...' : 'Calculate Catering Quote'}
          </button>
        </form>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Ingredients</h4>
            <button type="button" onClick={addCateringIngredient} className="text-xs px-2 py-1 border border-gray-300 rounded">Add Ingredient</button>
          </div>
          <div className="space-y-2">
            {cateringIngredients.map((row, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <select value={row.material_id} onChange={(e) => selectMaterialForIngredient(index, e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Pick material (optional)</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
                <input placeholder="Ingredient name" value={row.name} onChange={(e) => updateCateringIngredient(index, { name: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input placeholder="Quantity needed" type="number" step="0.01" value={row.quantity} onChange={(e) => updateCateringIngredient(index, { quantity: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input placeholder="Unit cost" type="number" step="0.01" value={row.unit_cost} onChange={(e) => updateCateringIngredient(index, { unit_cost: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <button type="button" onClick={() => removeCateringIngredient(index)} className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm">Remove</button>
              </div>
            ))}
          </div>
        </div>

        {cateringResult && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Cost / Plate</p><p className="font-semibold">{formatCurrency(cateringResult.breakdown.cost_per_plate)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Safe / Plate</p><p className="font-semibold text-emerald-700">{formatCurrency(cateringResult.pricing.safe_per_plate)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Standard / Plate</p><p className="font-semibold text-indigo-700">{formatCurrency(cateringResult.pricing.standard_per_plate)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Premium / Plate</p><p className="font-semibold text-violet-700">{formatCurrency(cateringResult.pricing.premium_per_plate)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Total Quote</p><p className="font-semibold text-cyan-700">{formatCurrency(cateringResult.pricing.total_quote)}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-gray-500">Expected Profit</p><p className="font-semibold text-amber-700">{formatCurrency(cateringResult.pricing.expected_profit)}</p></div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, SKU or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">Product Name</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3">Barcode</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3 text-right">Cost</th>
                <th className="px-6 py-3 text-right">Price</th>
                <th className="px-6 py-3 text-right">Profit/Unit</th>
                <th className="px-6 py-3 text-center">Stock</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{product.name}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono">{product.sku}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">{product.barcode || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500">{formatCurrency(product.cost_price)}</td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(product.selling_price)}</td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-700">
                    {formatCurrency(product.product_profit ?? (product.selling_price - product.cost_price))}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      product.quantity === 0 ? 'bg-red-100 text-red-800' :
                      product.quantity <= product.min_threshold ? 'bg-orange-100 text-orange-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {product.quantity}
                      {product.quantity <= product.min_threshold && <AlertCircle className="ml-1 h-3 w-3" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button 
                        onClick={() => openEdit(product)}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input
                    required
                    type="text"
                    value={formData.sku}
                    onChange={e => setFormData({...formData, sku: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    required
                    type="text"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barcode (optional)</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={e => setFormData({...formData, barcode: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={e => setFormData({...formData, cost_price: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={formData.selling_price}
                    onChange={e => setFormData({...formData, selling_price: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    required
                    type="number"
                    value={formData.quantity}
                    onChange={e => setFormData({...formData, quantity: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Threshold</label>
                  <input
                    required
                    type="number"
                    value={formData.min_threshold}
                    onChange={e => setFormData({...formData, min_threshold: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
