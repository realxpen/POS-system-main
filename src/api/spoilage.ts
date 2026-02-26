import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM spoilage_logs
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const db = getDb();
  const { item_type, item_id, quantity, reason } = req.body;
  const qty = Number(quantity || 0);
  if (!['product', 'material'].includes(item_type)) {
    return res.status(400).json({ error: 'item_type must be product or material' });
  }
  if (qty <= 0) return res.status(400).json({ error: 'quantity must be > 0' });

  const tx = db.transaction(() => {
    let loss = 0;
    if (item_type === 'product') {
      const row = db.prepare('SELECT quantity, cost_price, name FROM products WHERE id = ?').get(item_id) as any;
      if (!row) throw new Error('Product not found');
      if (row.quantity < qty) throw new Error('Insufficient product quantity');
      db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(qty, item_id);
      db.prepare(`
        INSERT INTO stock_logs (
          product_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, notes
        ) VALUES (?, 'adjustment', ?, ?, ?, 'spoilage', ?)
      `).run(item_id, row.quantity, -qty, row.quantity - qty, `Spoilage: ${reason || 'N/A'}`);
      loss = qty * Number(row.cost_price || 0);
    } else {
      const row = db.prepare('SELECT quantity, unit_cost, name FROM materials WHERE id = ?').get(item_id) as any;
      if (!row) throw new Error('Material not found');
      if (row.quantity < qty) throw new Error('Insufficient material quantity');
      db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(qty, item_id);
      db.prepare(`
        INSERT INTO material_logs (
          material_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, notes
        ) VALUES (?, 'spoilage', ?, ?, ?, 'spoilage', ?)
      `).run(item_id, row.quantity, -qty, row.quantity - qty, `Spoilage: ${reason || 'N/A'}`);
      loss = qty * Number(row.unit_cost || 0);
    }

    db.prepare(`
      INSERT INTO spoilage_logs (item_type, item_id, quantity, reason, estimated_loss)
      VALUES (?, ?, ?, ?, ?)
    `).run(item_type, item_id, qty, reason || null, loss);

    db.prepare(`
      INSERT INTO expenses (title, category, amount, date, payment_method, notes, updated_at)
      VALUES (?, 'Spoilage', ?, date('now'), 'cash', ?, CURRENT_TIMESTAMP)
    `).run(
      `Spoilage - ${item_type} #${item_id}`,
      loss,
      reason || null,
    );
  });

  try {
    tx();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
