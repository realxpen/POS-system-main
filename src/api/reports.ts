import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';
import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

const router = Router();
router.use(authenticate);

router.get('/dashboard', (req, res) => {
  const db = getDb();

  const revenueToday = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) = date('now')
  `).get() as any;
  const revenueWeek = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', '-6 days')
  `).get() as any;
  const revenueMonth = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE date(created_at) >= date('now', 'start of month')
  `).get() as any;

  const expensesToday = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) = date('now')
  `).get() as any;
  const expensesMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE date(date) >= date('now', 'start of month')
  `).get() as any;

  const taxRateRow = db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any;
  const taxRate = Number(taxRateRow?.tax_rate || 0);
  const taxToday = revenueToday.total * (taxRate / 100);
  const taxMonth = revenueMonth.total * (taxRate / 100);

  const transactionsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE date(created_at) = date('now')
  `).get() as any;
  const transactionsTotal = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as any;

  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as any;
  const lowStock = db.prepare(`
    SELECT COUNT(*) as count
    FROM products
    WHERE quantity <= min_threshold AND quantity > 0
  `).get() as any;
  const outOfStock = db.prepare('SELECT COUNT(*) as count FROM products WHERE quantity = 0').get() as any;
  const healthyStock = db.prepare(`
    SELECT COUNT(*) as count
    FROM products
    WHERE quantity > min_threshold
  `).get() as any;

  const finishingSoon = db.prepare(`
    SELECT id, name, sku, quantity, min_threshold
    FROM products
    WHERE quantity <= min_threshold AND quantity > 0
    ORDER BY quantity ASC
    LIMIT 5
  `).all();
  const outOfStockProducts = db.prepare(`
    SELECT id, name, sku, quantity
    FROM products
    WHERE quantity = 0
    ORDER BY name ASC
    LIMIT 5
  `).all();
  const fastMoving = db.prepare(`
    SELECT
      ti.product_id,
      ti.product_name,
      SUM(ti.quantity) as quantity_sold
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE date(t.created_at) >= date('now', '-30 days')
    GROUP BY ti.product_id, ti.product_name
    ORDER BY quantity_sold DESC
    LIMIT 5
  `).all();

  const recentTransactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5').all();

  const stockHealthPct = totalProducts.count > 0
    ? Math.round((healthyStock.count / totalProducts.count) * 100)
    : 0;

  res.json({
    revenue: {
      today: revenueToday.total,
      week: revenueWeek.total,
      month: revenueMonth.total,
    },
    expenses: {
      today: expensesToday.total,
      month: expensesMonth.total,
    },
    tax: {
      rate: taxRate,
      today: taxToday,
      month: taxMonth,
    },
    profit: {
      today: revenueToday.total - expensesToday.total - taxToday,
      month: revenueMonth.total - expensesMonth.total - taxMonth,
    },
    transactions: {
      today: transactionsToday.count,
      total: transactionsTotal.count,
    },
    inventory: {
      total: totalProducts.count,
      lowStock: lowStock.count,
      outOfStock: outOfStock.count,
      stockHealthPct,
    },
    status: {
      finishingSoon,
      outOfStockProducts,
      fastMoving,
    },
    recentTransactions,
  });
});

router.get('/sales-chart', (req, res) => {
  const db = getDb();
  // Get last 7 days revenue
  const sales = db.prepare(`
    SELECT date(created_at) as date, SUM(total_amount) as total 
    FROM transactions 
    WHERE created_at >= date('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `).all();
  res.json(sales);
});

router.get('/attendant-performance', (req, res) => {
  const db = getDb();
  const performance = req.user?.role === 'attendant'
    ? db.prepare(`
        SELECT attendant_name, COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as revenue
        FROM transactions
        WHERE date(created_at) = date('now') AND attendant_id = ?
        GROUP BY attendant_name
      `).all(req.user.id)
    : db.prepare(`
        SELECT attendant_name, COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as revenue
        FROM transactions
        WHERE date(created_at) = date('now')
        GROUP BY attendant_name
      `).all();
  res.json(performance);
});

router.get('/settings', (req, res) => {
  const db = getDb();
  const taxRate = db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any;
  res.json({ tax_rate: taxRate ? Number(taxRate.tax_rate) : 0 });
});

router.post('/settings', authorize(['admin']), (req, res) => {
  const { tax_rate } = req.body;
  const db = getDb();
  db.prepare(`
    INSERT INTO tax_settings (id, tax_rate, updated_at)
    VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      tax_rate = excluded.tax_rate,
      updated_at = CURRENT_TIMESTAMP
  `).run(Number(tax_rate));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', ?)").run(String(tax_rate));
  res.json({ success: true });
});

router.get('/financial-summary', (req, res) => {
  const db = getDb();
  const revenue = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN total_amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(created_at) >= date('now', 'start of month') THEN total_amount END), 0) as month
    FROM transactions
  `).get() as any;
  const expenses = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(date) = date('now') THEN amount END), 0) as today,
      COALESCE(SUM(CASE WHEN date(date) >= date('now', 'start of month') THEN amount END), 0) as month
    FROM expenses
  `).get() as any;
  const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;

  const taxToday = revenue.today * (taxRate / 100);
  const taxMonth = revenue.month * (taxRate / 100);
  res.json({
    revenue,
    expenses,
    tax: { rate: taxRate, today: taxToday, month: taxMonth },
    profit: {
      today: revenue.today - expenses.today - taxToday,
      month: revenue.month - expenses.month - taxMonth,
    },
  });
});

router.get('/inventory-report', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.category,
      p.quantity,
      p.min_threshold,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price) as profit_per_unit,
      CASE
        WHEN p.quantity = 0 THEN 'out_of_stock'
        WHEN p.quantity <= p.min_threshold THEN 'low_stock'
        ELSE 'healthy'
      END as stock_status
    FROM products p
    ORDER BY p.name
  `).all();
  res.json(rows);
});

router.get('/tax-report', (req, res) => {
  const db = getDb();
  const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
  const byMonth = db.prepare(`
    SELECT
      strftime('%Y-%m', created_at) as month,
      COALESCE(SUM(total_amount), 0) as taxable_revenue
    FROM transactions
    GROUP BY strftime('%Y-%m', created_at)
    ORDER BY month DESC
  `).all() as any[];
  const rows = byMonth.map((row) => ({
    ...row,
    tax_rate: taxRate,
    tax_amount: Number(row.taxable_revenue) * (Number(taxRate) / 100),
  }));
  res.json(rows);
});

router.get('/profit-report', (req, res) => {
  const db = getDb();
  const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
  const byDay = db.prepare(`
    WITH sales AS (
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
    ),
    costs AS (
      SELECT date(date) as day, COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      GROUP BY date(date)
    )
    SELECT
      COALESCE(sales.day, costs.day) as day,
      COALESCE(sales.revenue, 0) as revenue,
      COALESCE(costs.expenses, 0) as expenses
    FROM sales
    LEFT JOIN costs ON costs.day = sales.day
    UNION
    SELECT
      COALESCE(sales.day, costs.day) as day,
      COALESCE(sales.revenue, 0) as revenue,
      COALESCE(costs.expenses, 0) as expenses
    FROM costs
    LEFT JOIN sales ON sales.day = costs.day
    ORDER BY day DESC
    LIMIT 30
  `).all() as any[];
  const rows = byDay.map((row) => {
    const tax = Number(row.revenue) * (Number(taxRate) / 100);
    return {
      ...row,
      tax,
      profit: Number(row.revenue) - Number(row.expenses) - tax,
    };
  });
  res.json(rows.reverse());
});

router.get('/products/profit-analytics', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.cost_price,
      p.selling_price,
      (p.selling_price - p.cost_price) as profit_per_unit,
      COALESCE(SUM(ti.quantity), 0) as qty_sold,
      COALESCE(SUM((ti.unit_price - p.cost_price) * ti.quantity), 0) as realized_profit
    FROM products p
    LEFT JOIN transaction_items ti ON ti.product_id = p.id
    GROUP BY p.id
    ORDER BY realized_profit DESC
  `).all();
  res.json(rows);
});

router.get('/products/not-sold-30-days', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.quantity, p.category
    FROM products p
    LEFT JOIN transaction_items ti ON ti.product_id = p.id
    LEFT JOIN transactions t ON t.id = ti.transaction_id AND date(t.created_at) >= date('now', '-30 days')
    GROUP BY p.id
    HAVING COUNT(t.id) = 0
    ORDER BY p.name
  `).all();
  res.json(rows);
});

router.get('/credit-sales', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cs.*, t.invoice_number, t.customer_name
    FROM credit_sales cs
    JOIN transactions t ON t.id = cs.transaction_id
    ORDER BY cs.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/export/csv', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  let rows: any[] = [];

  if (type === 'tax') {
    const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
    rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).all().map((r: any) => ({ ...r, tax_rate: taxRate, tax_amount: Number(r.revenue) * (Number(taxRate) / 100) }));
  } else if (type === 'inventory') {
    rows = db.prepare('SELECT name, sku, category, quantity, min_threshold FROM products ORDER BY name').all();
  } else if (type === 'profit') {
    rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all();
  } else {
    rows = db.prepare(`
      SELECT invoice_number, customer_name, attendant_name, payment_method, subtotal, tax_amount, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 500
    `).all();
  }

  if (rows.length === 0) return res.status(404).json({ error: 'No data found for export' });

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

router.get('/export/excel', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  let rows: any[] = [];
  if (type === 'inventory') {
    rows = db.prepare('SELECT name, sku, category, quantity, min_threshold FROM products ORDER BY name').all();
  } else if (type === 'tax') {
    const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
    rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `).all().map((r: any) => ({ ...r, tax_rate: taxRate, tax_amount: Number(r.revenue) * (Number(taxRate) / 100) }));
  } else if (type === 'profit') {
    rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all();
  } else {
    rows = db.prepare(`
      SELECT invoice_number, customer_name, attendant_name, payment_method, subtotal, tax_amount, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 500
    `).all();
  }
  if (!rows.length) return res.status(404).json({ error: 'No data found for export' });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, type);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
  res.send(buf);
});

router.get('/export/pdf', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || 'transactions');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Smart POS ${type.toUpperCase()} Report`);
  doc.moveDown();

  if (type === 'inventory') {
    const rows = db.prepare('SELECT name, sku, quantity, min_threshold FROM products ORDER BY name LIMIT 100').all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.name} (${r.sku}) - Qty: ${r.quantity} / Min: ${r.min_threshold}`));
  } else if (type === 'tax') {
    const taxRate = (db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any)?.tax_rate || 0;
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 24
    `).all() as any[];
    rows.forEach((r) => {
      const tax = Number(r.revenue) * (Number(taxRate) / 100);
      doc.fontSize(10).text(`${r.month}  Revenue: ${Number(r.revenue).toFixed(2)}  Tax: ${tax.toFixed(2)}`);
    });
  } else if (type === 'profit') {
    const rows = db.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      GROUP BY date(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.day}  Revenue: ${Number(r.revenue).toFixed(2)}`));
  } else {
    const rows = db.prepare(`
      SELECT invoice_number, customer_name, total_amount, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 100
    `).all() as any[];
    rows.forEach((r) => doc.fontSize(10).text(`${r.invoice_number} | ${r.customer_name} | ${Number(r.total_amount).toFixed(2)} | ${r.created_at}`));
  }

  doc.end();
});

export default router;
