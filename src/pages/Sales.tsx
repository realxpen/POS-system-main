import { useState, useEffect } from 'react';
import { formatCurrency } from '../lib/utils';
import { Search, ShoppingCart, Trash2, Plus, Minus, User, Printer, ScanBarcode, Mail, FileDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  selling_price: number;
  quantity: number;
}

interface CartItem extends Product {
  cartQuantity: number;
}

export default function Sales() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [creditPaid, setCreditPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSale, setLastSale] = useState<{ id: number; invoice_number: string } | null>(null);

  useEffect(() => {
    fetch('/api/products').then(res => res.json()).then(setProducts);
    fetch('/api/reports/settings').then(res => res.json()).then(data => setTaxRate(data.tax_rate));
  }, []);

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.quantity) return prev; // Stock limit
        return prev.map(item => 
          item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
        );
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.cartQuantity + delta;
        if (newQty > item.quantity) return item; // Stock limit
        if (newQty < 1) return item;
        return { ...item, cartQuantity: newQty };
      }
      return item;
    }));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.cartQuantity), 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || 'Walk-in Customer',
          items: cart.map(item => ({ product_id: item.id, quantity: item.cartQuantity })),
          payment_method: paymentMethod,
          tax_rate: taxRate,
          amount_paid: paymentMethod === 'Credit' ? Number(creditPaid || 0) : total,
          due_date: paymentMethod === 'Credit' ? creditDueDate || null : null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLastSale({ id: data.id, invoice_number: data.invoice_number });
        setCart([]);
        setCustomerName('');
        setCreditPaid('');
        setCreditDueDate('');
        // Refresh products to update stock
        fetch('/api/products').then(res => res.json()).then(setProducts);
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Checkout failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode || '').toLowerCase().includes(search.toLowerCase())
  );

  const addByBarcode = () => {
    const code = barcode.trim().toLowerCase();
    if (!code) return;
    const match = products.find(
      (p) => p.sku.toLowerCase() === code || (p.barcode || '').toLowerCase() === code,
    );
    if (!match) {
      alert('No product matched this barcode/SKU');
      return;
    }
    addToCart(match);
    setBarcode('');
  };

  const downloadInvoicePdf = async () => {
    if (!lastSale) return;
    const txRes = await fetch(`/api/transactions/${lastSale.id}`);
    const tx = await txRes.json();
    if (!tx?.invoice?.id) return alert('Invoice record not found');
    window.open(`/api/invoices/${tx.invoice.id}/pdf`, '_blank');
  };

  const emailInvoice = async () => {
    if (!lastSale) return;
    const to = prompt('Recipient email address');
    if (!to) return;
    const txRes = await fetch(`/api/transactions/${lastSale.id}`);
    const tx = await txRes.json();
    if (!tx?.invoice?.id) return alert('Invoice record not found');
    const res = await fetch(`/api/invoices/${tx.invoice.id}/email`, {
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
          <button 
            onClick={() => setLastSale(null)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            New Sale
          </button>
          <button 
            onClick={() => window.print()}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Print Invoice
          </button>
          <button
            onClick={downloadInvoicePdf}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center"
          >
            <FileDown className="h-4 w-4 mr-2" />
            PDF
          </button>
          <button
            onClick={emailInvoice}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 enter-up">
      {/* Product Selection */}
      <div className="flex-1 flex flex-col panel-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-200/60 bg-white/70">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Scan or enter barcode/SKU"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addByBarcode();
                  }
                }}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              onClick={addByBarcode}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.quantity === 0}
                className={`flex flex-col p-4 rounded-xl border text-left transition-all ${
                  product.quantity === 0 
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' 
                    : 'bg-white/80 border-slate-200 hover:border-cyan-500 hover:shadow-lg hover:-translate-y-0.5'
                }`}
              >
                <span className="font-medium text-gray-900 truncate w-full">{product.name}</span>
                <span className="text-xs text-gray-500 mb-2">{product.sku}</span>
                <div className="mt-auto flex justify-between items-center w-full">
                  <span className="font-bold text-indigo-600">{formatCurrency(product.selling_price)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    product.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {product.quantity} left
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart & Checkout */}
      <div className="w-96 panel-card rounded-2xl flex flex-col h-full">
        <div className="p-4 border-b border-slate-200/70 bg-white/70">
          <h2 className="font-bold text-gray-900 flex items-center">
            <ShoppingCart className="h-5 w-5 mr-2" />
            Current Sale
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Cart is empty</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(item.selling_price)} x {item.cartQuantity}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => updateQuantity(item.id, -1)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Minus className="h-4 w-4 text-gray-500" />
                  </button>
                  <span className="text-sm font-medium w-4 text-center">{item.cartQuantity}</span>
                  <button 
                    onClick={() => updateQuantity(item.id, 1)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Plus className="h-4 w-4 text-gray-500" />
                  </button>
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="p-1 hover:bg-red-50 rounded ml-1"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200/70 bg-white/60 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax ({taxRate}%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Customer Name (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {['Cash', 'Card', 'Transfer', 'Credit'].map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 text-sm font-medium rounded-lg border ${
                    paymentMethod === method 
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-700' 
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
            {paymentMethod === 'Credit' && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount paid now"
                  value={creditPaid}
                  onChange={(e) => setCreditPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <input
                  type="date"
                  value={creditDueDate}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors"
            >
              {isProcessing ? 'Processing...' : `Charge ${formatCurrency(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
