import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const materials = db.prepare(`
    SELECT
      m.*,
      CASE WHEN m.quantity <= m.min_threshold THEN 1 ELSE 0 END as low_stock
    FROM materials m
    ORDER BY name
  `).all();
  res.json(materials);
});

router.post('/', (req, res) => {
  const db = getDb();
  const { name, sku, unit, quantity, min_threshold, unit_cost } = req.body;
  try {
    const qty = Number(quantity || 0);
    const info = db.prepare(`
      INSERT INTO materials (name, sku, unit, quantity, min_threshold, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, sku, unit, qty, Number(min_threshold || 0), Number(unit_cost || 0));
    res.json({ id: info.lastInsertRowid, name, sku, unit, quantity: qty });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, sku, unit, quantity, min_threshold, unit_cost } = req.body;
  try {
    const before = db.prepare(`SELECT quantity FROM materials WHERE id = ?`).get(req.params.id) as any;
    if (!before) return res.status(404).json({ error: 'Material not found' });
    const nextQty = Number(quantity);
    db.prepare(`
      UPDATE materials
      SET name = ?, sku = ?, unit = ?, quantity = ?, min_threshold = ?, unit_cost = ?
      WHERE id = ?
    `).run(name, sku, unit, nextQty, Number(min_threshold || 0), Number(unit_cost || 0), req.params.id);

    if (before.quantity !== nextQty) {
      db.prepare(`
        INSERT INTO material_logs (
          material_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, notes
        ) VALUES (?, 'adjustment', ?, ?, ?, 'material_update', ?)
      `).run(req.params.id, before.quantity, nextQty - before.quantity, nextQty, `Adjusted by ${req.user?.full_name || 'system'}`);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/recipes/:productId', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pr.*, m.name as material_name, m.unit, m.quantity as material_quantity
    FROM product_recipes pr
    JOIN materials m ON m.id = pr.material_id
    WHERE pr.product_id = ?
    ORDER BY m.name
  `).all(req.params.productId);
  res.json(rows);
});

router.put('/recipes/:productId', (req, res) => {
  const db = getDb();
  const productId = Number(req.params.productId);
  const ingredients = Array.isArray(req.body.ingredients) ? req.body.ingredients : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM product_recipes WHERE product_id = ?').run(productId);
    const insert = db.prepare(`
      INSERT INTO product_recipes (product_id, material_id, quantity_required)
      VALUES (?, ?, ?)
    `);
    for (const ing of ingredients) {
      insert.run(productId, Number(ing.material_id), Number(ing.quantity_required));
    }
  });
  try {
    tx();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/restock', (req, res) => {
  const db = getDb();
  const materialId = Number(req.params.id);
  const qty = Number(req.body.quantity || 0);
  if (qty <= 0) return res.status(400).json({ error: 'Quantity must be > 0' });
  const mat = db.prepare('SELECT quantity FROM materials WHERE id = ?').get(materialId) as any;
  if (!mat) return res.status(404).json({ error: 'Material not found' });

  const after = mat.quantity + qty;
  db.prepare('UPDATE materials SET quantity = ? WHERE id = ?').run(after, materialId);
  db.prepare(`
    INSERT INTO material_logs (
      material_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, notes
    ) VALUES (?, 'restock', ?, ?, ?, 'manual_restock', ?)
  `).run(materialId, mat.quantity, qty, after, req.body.notes || null);
  res.json({ success: true });
});

export default router;
