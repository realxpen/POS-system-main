import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

type InvoiceItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type Invoice = {
  id: number;
  invoice_number: string;
  customer_name: string;
  attendant_name: string;
  issued_at: string;
  payment_method: string;
  total_amount: number;
  items: InvoiceItem[];
};

const formatNaira = (amount: number) => `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PrintInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('Invalid invoice id');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/invoices/${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load invoice');
        }
        const data = await res.json();
        setInvoice(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  useEffect(() => {
    if (!loading && invoice) {
      const timer = setTimeout(() => window.print(), 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, invoice]);

  const rows = useMemo(() => invoice?.items || [], [invoice]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading invoice...</div>;
  }

  if (error || !invoice) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-600">{error || 'Invoice not found'}</p>
        <button
          onClick={() => navigate('/sales')}
          className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Back to Sales
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[820px] bg-white shadow-lg print:shadow-none">
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between gap-4">
            <h1 className="text-5xl font-light tracking-wide text-slate-900">INVOICE</h1>
            <div className="bg-teal-400 px-5 py-3 text-white min-w-[280px]">
              <div className="text-3xl font-bold leading-none">SMART POS</div>
              <div className="text-xs text-teal-50 mt-1">Inventory + Accounting Suite</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-4 grid grid-cols-2 gap-6 text-slate-700">
          <div>
            <div className="text-sm text-slate-500 mb-1">Invoice to:</div>
            <div className="text-2xl text-slate-900">{invoice.customer_name || 'Walk-in Customer'}</div>
            <div className="text-sm text-slate-500">Customer Address / Contact</div>
          </div>
          <div className="text-sm space-y-1 justify-self-end">
            <div><span className="font-semibold">Invoice #</span> {invoice.invoice_number}</div>
            <div><span className="font-semibold">Date</span> {new Date(invoice.issued_at).toLocaleDateString('en-NG')}</div>
            <div><span className="font-semibold">Attendant</span> {invoice.attendant_name}</div>
          </div>
        </div>

        <div className="px-8 pb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-700 text-white text-sm">
                <th className="text-left px-3 py-2 font-semibold">ITEM DESCRIPTION</th>
                <th className="text-center px-3 py-2 font-semibold w-16">QTY</th>
                <th className="text-right px-3 py-2 font-semibold w-32">PRICE</th>
                <th className="text-right px-3 py-2 font-semibold w-32">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, idx) => (
                <tr key={`${item.product_name}-${idx}`} className={idx % 2 ? 'bg-slate-50' : ''}>
                  <td className="px-3 py-2 text-sm">{item.product_name}</td>
                  <td className="px-3 py-2 text-sm text-center">{item.quantity}</td>
                  <td className="px-3 py-2 text-sm text-right" style={{ fontFamily: "'Segoe UI Symbol','Segoe UI',Arial,sans-serif" }}>{formatNaira(Number(item.unit_price || 0))}</td>
                  <td className="px-3 py-2 text-sm text-right" style={{ fontFamily: "'Segoe UI Symbol','Segoe UI',Arial,sans-serif" }}>{formatNaira(Number(item.subtotal || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end text-xs text-slate-500">Prices include VAT.</div>

          <div className="mt-6 grid grid-cols-2 gap-6">
            <div className="bg-teal-400 text-white px-5 py-3 text-base font-semibold">
              PAYMENT METHOD
              <div className="mt-2 text-lg font-medium">{invoice.payment_method || 'N/A'}</div>
            </div>
            <div className="bg-teal-400 text-white px-5 py-3 text-base font-semibold text-right">
              GRAND TOTAL
              <div className="mt-2 text-2xl font-bold" style={{ fontFamily: "'Segoe UI Symbol','Segoe UI',Arial,sans-serif" }}>{formatNaira(Number(invoice.total_amount || 0))}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
