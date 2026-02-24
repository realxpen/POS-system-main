import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const month = String(req.query.month || '').trim(); // YYYY-MM
  const category = String(req.query.category || '').trim();
  const recurring = String(req.query.recurring || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();

  const clauses: string[] = [];
  const params: any[] = [];

  if (month) {
    clauses.push("strftime('%Y-%m', date) = ?");
    params.push(month);
  }
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (recurring === 'yes') clauses.push('is_recurring = 1');
  if (recurring === 'no') clauses.push('is_recurring = 0');
  if (search) {
    clauses.push('(lower(title) LIKE ? OR lower(notes) LIKE ? OR lower(vendor) LIKE ? OR lower(reference_no) LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const expenses = db.prepare(`
    SELECT *
    FROM expenses
    ${whereSql}
    ORDER BY date DESC, created_at DESC
  `).all(...params);

  res.json(expenses);
});

router.get('/summary', (req, res) => {
  const db = getDb();
  const month = String(req.query.month || new Date().toISOString().slice(0, 7)); // YYYY-MM

  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = ? THEN amount END), 0) as total_month,
      COALESCE(SUM(CASE WHEN date(date) = date('now') THEN amount END), 0) as total_today,
      COALESCE(SUM(CASE WHEN is_recurring = 1 AND strftime('%Y-%m', date) = ? THEN amount END), 0) as recurring_month,
      COALESCE(COUNT(CASE WHEN is_recurring = 1 AND strftime('%Y-%m', date) = ? THEN 1 END), 0) as recurring_count
    FROM expenses
  `).get(month, month, month) as any;

  const byCategory = db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE strftime('%Y-%m', date) = ?
    GROUP BY category
    ORDER BY total DESC
  `).all(month);

  res.json({ month, summary, byCategory });
});

router.get('/report', (req, res) => {
  const db = getDb();
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));

  const rows = db.prepare(`
    SELECT
      id,
      title,
      category,
      amount,
      date,
      is_recurring,
      recurring_interval,
      vendor,
      payment_method,
      reference_no,
      notes
    FROM expenses
    WHERE strftime('%Y-%m', date) = ?
    ORDER BY date DESC
  `).all(month);

  res.json({ month, rows });
});

router.post('/', (req, res) => {
  const { title, category, amount, date, notes, is_recurring, recurring_interval, vendor, payment_method, reference_no } = req.body;
  const db = getDb();

  const cleanTitle = String(title || '').trim();
  const cleanCategory = String(category || '').trim();
  const numericAmount = Number(amount);
  const cleanDate = String(date || '').trim();

  if (!cleanTitle) return res.status(400).json({ error: 'Title is required' });
  if (!cleanCategory) return res.status(400).json({ error: 'Category is required' });
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!cleanDate) return res.status(400).json({ error: 'Date is required' });

  try {
    const stmt = db.prepare(`
      INSERT INTO expenses (
        title, category, amount, date, is_recurring, recurring_interval,
        vendor, payment_method, reference_no, created_by, notes, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const info = stmt.run(
      cleanTitle,
      cleanCategory,
      numericAmount,
      cleanDate,
      is_recurring ? 1 : 0,
      is_recurring ? String(recurring_interval || 'monthly') : null,
      vendor ? String(vendor).trim() : null,
      payment_method ? String(payment_method).toLowerCase() : 'cash',
      reference_no ? String(reference_no).trim() : null,
      req.user?.id || null,
      notes ? String(notes).trim() : null,
    );
    res.json({ id: info.lastInsertRowid, ...req.body });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, category, amount, date, notes, is_recurring, recurring_interval, vendor, payment_method, reference_no } = req.body;
  const db = getDb();

  const cleanTitle = String(title || '').trim();
  const cleanCategory = String(category || '').trim();
  const numericAmount = Number(amount);
  const cleanDate = String(date || '').trim();

  if (!cleanTitle) return res.status(400).json({ error: 'Title is required' });
  if (!cleanCategory) return res.status(400).json({ error: 'Category is required' });
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!cleanDate) return res.status(400).json({ error: 'Date is required' });

  try {
    const info = db.prepare(`
      UPDATE expenses
      SET
        title = ?,
        category = ?,
        amount = ?,
        date = ?,
        is_recurring = ?,
        recurring_interval = ?,
        vendor = ?,
        payment_method = ?,
        reference_no = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      cleanTitle,
      cleanCategory,
      numericAmount,
      cleanDate,
      is_recurring ? 1 : 0,
      is_recurring ? String(recurring_interval || 'monthly') : null,
      vendor ? String(vendor).trim() : null,
      payment_method ? String(payment_method).toLowerCase() : 'cash',
      reference_no ? String(reference_no).trim() : null,
      notes ? String(notes).trim() : null,
      id,
    );
    if (info.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
