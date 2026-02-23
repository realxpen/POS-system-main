import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const rows = user.role === 'attendant'
    ? db.prepare(`
        SELECT cs.*, t.invoice_number, t.customer_name, t.attendant_id
        FROM credit_sales cs
        JOIN transactions t ON t.id = cs.transaction_id
        WHERE t.attendant_id = ?
        ORDER BY cs.created_at DESC
      `).all(user.id)
    : db.prepare(`
        SELECT cs.*, t.invoice_number, t.customer_name, t.attendant_id
        FROM credit_sales cs
        JOIN transactions t ON t.id = cs.transaction_id
        ORDER BY cs.created_at DESC
      `).all();
  res.json(rows);
});

router.post('/:id/payment', authorize(['admin', 'manager', 'attendant']), (req, res) => {
  const db = getDb();
  const paymentAmount = Number(req.body.amount || 0);
  if (paymentAmount <= 0) return res.status(400).json({ error: 'Invalid payment amount' });

  try {
    const row = db.prepare(`
      SELECT cs.*, t.attendant_id
      FROM credit_sales cs
      JOIN transactions t ON t.id = cs.transaction_id
      WHERE cs.id = ?
    `).get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Credit sale not found' });
    if (req.user?.role === 'attendant' && row.attendant_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const nextPaid = Math.min(row.total_amount, row.amount_paid + paymentAmount);
    const balance = Math.max(0, row.total_amount - nextPaid);
    const status = balance <= 0 ? 'paid' : 'partial';

    db.prepare(`
      UPDATE credit_sales
      SET amount_paid = ?, balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextPaid, balance, status, req.params.id);

    res.json({ success: true, amount_paid: nextPaid, balance, status });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
