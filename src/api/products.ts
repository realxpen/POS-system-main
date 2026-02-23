import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = getDb();
  const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
  const rows = branchId
    ? db.prepare('SELECT * FROM products WHERE branch_id = ? ORDER BY name').all(branchId)
    : db.prepare('SELECT * FROM products ORDER BY name').all();

  const products = rows.map((p: any) => ({
    ...p,
    product_profit: p.selling_price - p.cost_price,
    stock_status: p.quantity === 0 ? 'out_of_stock' : p.quantity <= p.min_threshold ? 'low_stock' : 'healthy',
  }));
  res.json(products);
});

router.post('/', authorize(['admin', 'manager']), (req, res) => {
  const { name, sku, barcode, category, cost_price, selling_price, quantity, min_threshold, branch_id } = req.body;
  const db = getDb();
  
  try {
    const qty = Number(quantity || 0);
    const stmt = db.prepare(`
      INSERT INTO products (name, sku, barcode, category, cost_price, selling_price, quantity, initial_stock, min_threshold, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name,
      sku,
      barcode || null,
      category,
      Number(cost_price),
      Number(selling_price),
      qty,
      qty,
      Number(min_threshold || 5),
      Number(branch_id || req.user?.branch_id || 1),
    );
    res.json({ id: info.lastInsertRowid, ...req.body });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authorize(['admin', 'manager']), (req, res) => {
  const { name, sku, barcode, category, cost_price, selling_price, quantity, min_threshold, branch_id } = req.body;
  const { id } = req.params;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT quantity, branch_id FROM products WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const nextQty = Number(quantity);
    const stmt = db.prepare(`
      UPDATE products 
      SET name = ?, sku = ?, barcode = ?, category = ?, cost_price = ?, selling_price = ?, quantity = ?, min_threshold = ?, branch_id = ?
      WHERE id = ?
    `);
    stmt.run(
      name,
      sku,
      barcode || null,
      category,
      Number(cost_price),
      Number(selling_price),
      nextQty,
      Number(min_threshold),
      Number(branch_id || existing.branch_id || 1),
      id,
    );

    if (existing.quantity !== nextQty) {
      db.prepare(`
        INSERT INTO stock_logs (product_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, notes)
        VALUES (?, 'adjustment', ?, ?, ?, 'product_update', ?)
      `).run(
        id,
        existing.quantity,
        nextQty - existing.quantity,
        nextQty,
        `Adjusted by ${req.user?.full_name || 'system'}`,
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authorize(['admin', 'manager']), (req, res) => {
  const { id } = req.params;
  const db = getDb();
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
