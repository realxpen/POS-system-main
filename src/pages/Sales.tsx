import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../lib/utils';
import { Search, ShoppingCart, Trash2, Plus, Minus, User, Printer, ScanBarcode, Mail, FileDown } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  selling_price: number;
  safe_price?: number;
  standard_price?: number;
  premium_price?: number;
  quantity: number;
}

interface DraftInvoice {
  id: number;
  invoice_code: string;
  customer_name: string;
  status: 'open' | 'paid' | 'cancelled';
  transaction_id?: number | null;
  invoice_id?: number | null;
  updated_at: string;
}

interface DraftItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<(DraftInvoice & { items: DraftItem[] }) | null>(null);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [priceType, setPriceType] = useState<'safe' | 'standard' | 'premium'>('standard');
  const [vatRate, setVatRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSale, setLastSale] = useState<{ id: number; invoice_number: string; invoice_id?: number } | null>(null);
  const [draftFilter, setDraftFilter] = useState<'all' | 'open' | 'paid'>('all');

  const refreshProducts = async () => {
    const res = await fetch('/api/products');
    const data = await res.json();
    setProducts(data);
  };

  const refreshDrafts = async () => {
    const res = await fetch('/api/draft-invoices');
    const data = await res.json();
    setDrafts(data);
    if (!activeDraftId && data.length > 0) {
      setActiveDraftId(data[0].id);
    }
  };

  const fetchActiveDraft = async (id: number) => {
    const res = await fetch(`/api/draft-invoices/${id}`);
    const data = await res.json();
    setActiveDraft(data);
    setCustomerName(data.customer_name || '');
  };

  useEffect(() => {
    (async () => {
      await Promise.all([
        refreshProducts(),
        refreshDrafts(),
        fetch('/api/reports/settings').then(res => res.json()).then(data => {
          const rate = Number(data.vat_rate ?? data.tax_rate ?? 7.5);
          setVatRate(rate > 0 && rate <= 15 ? rate : 7.5);
        }),
      ]);
    })();
  }, []);

  useEffect(() => {
    if (activeDraftId) fetchActiveDraft(activeDraftId);
  }, [activeDraftId]);

  const createDraft = async () => {
    const res = await fetch('/api/draft-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: 'Walk-in' }),
    });
    const data = await res.json();
    await refreshDrafts();
    setActiveDraftId(data.id);
  };

  const updateDraftMeta = async () => {
    if (!activeDraftId) return;
    await fetch(`/api/draft-invoices/${activeDraftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: customerName || 'Walk-in' }),
    });
    await refreshDrafts();
    await fetchActiveDraft(activeDraftId);
  };

  const addToDraft = async (product: Product) => {
    if (!activeDraftId || product.quantity <= 0 || activeDraft?.status !== 'open') return;
    await fetch(`/api/draft-invoices/${activeDraftId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, quantity: 1 }),
    });
    await fetchActiveDraft(activeDraftId);
  };

  const updateItemQty = async (itemId: number, nextQty: number) => {
    if (!activeDraftId || nextQty < 1) return;
    await fetch(`/api/draft-invoices/${activeDraftId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: nextQty }),
    });
    await fetchActiveDraft(activeDraftId);
  };

  const removeItem = async (itemId: number) => {
    if (!activeDraftId) return;
    await fetch(`/api/draft-invoices/${activeDraftId}/items/${itemId}`, { method: 'DELETE' });
    await fetchActiveDraft(activeDraftId);
  };

  const closeDraft = async (id: number) => {
    if (!confirm('Close this draft invoice?')) return;
    await fetch(`/api/draft-invoices/${id}`, { method: 'DELETE' });
    await refreshDrafts();
    if (activeDraftId === id) setActiveDraftId(null);
  };

  const cartItems = activeDraft?.items || [];
  const isDraftOpen = activeDraft?.status === 'open';
  const total = cartItems.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const subtotalExVat = total / (1 + vatRate / 100);

  const checkoutDraft = async () => {
    if (!activeDraftId || cartItems.length === 0 || !isDraftOpen) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || 'Walk-in',
          items: cartItems.map(item => ({ product_id: item.product_id, quantity: item.quantity, price_type: priceType })),
          payment_method: paymentMethod,
          tax_rate: vatRate,
          prices_include_vat: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Checkout failed');

      setLastSale({ id: data.id, invoice_number: data.invoice_number, invoice_id: data.invoice_id });
      await fetch(`/api/draft-invoices/${activeDraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          customer_name: customerName || 'Walk-in',
          transaction_id: data.id,
          invoice_id: data.invoice_id,
        }),
      });
      await refreshDrafts();
      await refreshProducts();
      setActiveDraftId(null);
      setActiveDraft(null);
      setCustomerName('');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [products, search]);

  const filteredDrafts = useMemo(() => {
    if (draftFilter === 'all') return drafts;
    return drafts.filter((d) => d.status === draftFilter);
  }, [drafts, draftFilter]);

  const addByBarcode = () => {
    if (!isDraftOpen) return;
    const code = barcode.trim().toLowerCase();
    if (!code) return;
    const match = products.find((p) => p.sku.toLowerCase() === code || (p.barcode || '').toLowerCase() === code);
    if (!match) return alert('No product matched this barcode/SKU');
    addToDraft(match);
    setBarcode('');
  };

  const downloadInvoicePdf = async () => {
    const invoiceId = lastSale?.invoice_id || activeDraft?.invoice_id;
    if (!invoiceId) return alert('Invoice record not found');
    window.open(`/api/invoices/${invoiceId}/pdf?download=1`, '_blank');
  };

  const printInvoicePdf = async () => {
    const invoiceId = lastSale?.invoice_id || activeDraft?.invoice_id;
    if (!invoiceId) return alert('Invoice record not found');
    window.open(`/print-invoice/${invoiceId}`, '_blank');
  };

  const emailInvoice = async () => {
    const invoiceId = lastSale?.invoice_id || activeDraft?.invoice_id;
    if (!invoiceId) return alert('Invoice record not found');
    const to = prompt('Recipient email address');
    if (!to) return;
    const res = await fetch(`/api/invoices/${invoiceId}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to send invoice');
    alert('Invoice sent');
  };

  if (lastSale) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] space-y-6 enter-up">
        <div className="bg-green-100 p-4 rounded-full">
          <Printer className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Transaction Successful!</h2>
        <p className="text-gray-500">Transaction ID: #{lastSale.id}</p>
        <p className="text-sm text-gray-500 font-mono">{lastSale.invoice_number}</p>
        <div className="flex space-x-4">
          <button onClick={() => setLastSale(null)} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Continue
          </button>
          <button onClick={printInvoicePdf} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Print
          </button>
          <button onClick={downloadInvoicePdf} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center">
            <FileDown className="h-4 w-4 mr-2" />
            PDF
          </button>
          <button onClick={emailInvoice} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_420px] gap-6 h-[calc(100vh-110px)] enter-up">
      <div className="dark-card rounded-2xl p-4 overflow-y-auto text-white">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-white">Invoice Workspace</h3>
          <button onClick={createDraft} className="px-3 py-1.5 text-xs bg-teal-500 text-white rounded-lg">New</button>
        </div>
        <div className="flex gap-2 mb-3">
          <button className={`chip ${draftFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setDraftFilter('all')}>All</button>
          <button className={`chip ${draftFilter === 'open' ? 'chip-active' : ''}`} onClick={() => setDraftFilter('open')}>Open</button>
          <button className={`chip ${draftFilter === 'paid' ? 'chip-active' : ''}`} onClick={() => setDraftFilter('paid')}>Paid</button>
        </div>
        <div className="space-y-2">
          {filteredDrafts.map((d) => (
            <div key={d.id} className={`rounded-xl border p-3 cursor-pointer hover-rise ${activeDraftId === d.id ? 'border-teal-400 bg-teal-500/10' : 'border-slate-700 bg-slate-900/40'}`} onClick={() => setActiveDraftId(d.id)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-mono text-slate-300">{d.invoice_code}</p>
                  <p className="text-sm font-medium text-white truncate">{d.customer_name || 'Walk-in'}</p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full capitalize ${d.status === 'open' ? 'bg-amber-200 text-amber-800' : d.status === 'paid' ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                  {d.status}
                </span>
              </div>
              <div className="mt-2 flex justify-end">
                <button onClick={(e) => { e.stopPropagation(); closeDraft(d.id); }} className="text-xs text-red-300 hover:text-red-200">Close</button>
              </div>
            </div>
          ))}
          {filteredDrafts.length === 0 && <p className="text-sm text-slate-300">No invoices yet.</p>}
        </div>
      </div>

      <div className="panel-card rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200/60 bg-white/70">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Scan or enter barcode/SKU"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByBarcode(); } }}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button onClick={addByBarcode} disabled={!isDraftOpen} className="px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-400">Add</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToDraft(product)}
                disabled={product.quantity === 0 || !activeDraftId || !isDraftOpen}
                className={`flex flex-col p-4 rounded-xl border text-left transition-all ${
                  product.quantity === 0 || !isDraftOpen
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : 'bg-white/90 border-slate-200 hover:border-teal-500 hover:shadow-lg hover:-translate-y-0.5'
                }`}
              >
                <span className="font-medium text-gray-900 truncate w-full">{product.name}</span>
                <span className="text-xs text-gray-500 mb-2">{product.sku}</span>
                <div className="mt-auto flex justify-between items-center w-full">
                  <span className="font-bold text-slate-900">{formatCurrency(product.selling_price * (1 + vatRate / 100))}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${product.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {product.quantity} left
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-card rounded-2xl flex flex-col h-full">
        <div className="p-4 border-b border-slate-200/70 bg-white/70">
          <h2 className="font-bold text-gray-900 flex items-center">
            <ShoppingCart className="h-5 w-5 mr-2" />
            {activeDraft ? activeDraft.invoice_code : 'Select Invoice'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cartItems.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>{activeDraft ? 'Cart is empty' : 'Select or create an invoice first'}</p>
            </div>
          ) : (
            cartItems.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{item.product_name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(item.unit_price)} x {item.quantity}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button disabled={!isDraftOpen} onClick={() => updateItemQty(item.id, item.quantity - 1)} className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"><Minus className="h-4 w-4 text-gray-500" /></button>
                  <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                  <button disabled={!isDraftOpen} onClick={() => updateItemQty(item.id, item.quantity + 1)} className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"><Plus className="h-4 w-4 text-gray-500" /></button>
                  <button disabled={!isDraftOpen} onClick={() => removeItem(item.id)} className="p-1 hover:bg-red-50 rounded ml-1 disabled:opacity-50"><Trash2 className="h-4 w-4 text-red-500" /></button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-slate-200/70 bg-white/60 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotalExVat)}</span></div>
            <div className="text-xs text-gray-500">Prices already include VAT.</div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Total</span><span>{formatCurrency(total)}</span></div>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} onBlur={updateDraftMeta} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['safe', 'standard', 'premium'] as const).map(tier => (
                <button
                  key={tier}
                  onClick={() => setPriceType(tier)}
                  className={`py-2 text-xs font-medium rounded-lg border ${priceType === tier ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {tier}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['Cash', 'Card', 'Transfer', 'Credit'].map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 text-sm font-medium rounded-lg border ${paymentMethod === method ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {method}
                </button>
              ))}
            </div>
            {isDraftOpen ? (
              <button onClick={checkoutDraft} disabled={!activeDraftId || cartItems.length === 0 || isProcessing} className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors">
                {isProcessing ? 'Processing...' : `Charge ${formatCurrency(total)}`}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  This invoice is {activeDraft?.status}. Charging is locked.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={printInvoicePdf} disabled={!activeDraft?.invoice_id} className="py-2 text-xs font-medium rounded-lg border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Print
                  </button>
                  <button onClick={downloadInvoicePdf} disabled={!activeDraft?.invoice_id} className="py-2 text-xs font-medium rounded-lg border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    PDF
                  </button>
                  <button onClick={emailInvoice} disabled={!activeDraft?.invoice_id} className="py-2 text-xs font-medium rounded-lg border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
