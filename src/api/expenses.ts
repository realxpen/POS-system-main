import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
  res.json(expenses);
});

router.post('/', (req, res) => {
  const { title, category, amount, date, notes, is_recurring, recurring_interval } = req.body;
  const db = getDb();
  
  try {
    const stmt = db.prepare(`
      INSERT INTO expenses (title, category, amount, date, is_recurring, recurring_interval, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      title,
      category,
      Number(amount),
      date,
      is_recurring ? 1 : 0,
      is_recurring ? recurring_interval || 'monthly' : null,
      notes || null,
    );
    res.json({ id: info.lastInsertRowid, ...req.body });
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
