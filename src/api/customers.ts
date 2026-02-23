import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.*,
           COALESCE(SUM(t.total_amount), 0) as total_spent,
           COUNT(t.id) as transaction_count
    FROM customers c
    LEFT JOIN transactions t ON t.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(customers);
});

router.post('/', (req, res) => {
  const { full_name, email, phone, address } = req.body;
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO customers (full_name, email, phone, address)
      VALUES (?, ?, ?, ?)
    `).run(full_name, email || null, phone || null, address || null);
    res.json({ id: info.lastInsertRowid, full_name, email, phone, address });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { full_name, email, phone, address } = req.body;
  const db = getDb();
  try {
    db.prepare(`
      UPDATE customers SET full_name = ?, email = ?, phone = ?, address = ?
      WHERE id = ?
    `).run(full_name, email || null, phone || null, address || null, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authorize(['admin', 'manager']), (req, res) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
