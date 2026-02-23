import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

function makePoNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PO-${y}${m}${day}-${rand}`;
}

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT po.*, s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    ORDER BY po.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { supplier_id, branch_id, items, notes } = req.body;
  const db = getDb();
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  try {
    const result = db.transaction(() => {
      const poNumber = makePoNumber();
      let totalCost = 0;

      const poInfo = db.prepare(`
        INSERT INTO purchase_orders (po_number, supplier_id, branch_id, status, total_cost, notes)
        VALUES (?, ?, ?, 'pending', 0, ?)
      `).run(poNumber, Number(supplier_id), Number(branch_id || req.user?.branch_id || 1), notes || null);
      const purchaseOrderId = Number(poInfo.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        const qty = Number(item.quantity);
        const cost = Number(item.unit_cost);
        const subtotal = qty * cost;
        totalCost += subtotal;
        insertItem.run(purchaseOrderId, Number(item.product_id), qty, cost, subtotal);
      }

      db.prepare('UPDATE purchase_orders SET total_cost = ? WHERE id = ?').run(totalCost, purchaseOrderId);
      return { id: purchaseOrderId, po_number: poNumber, total_cost: totalCost };
    })();

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/receive', (req, res) => {
  const db = getDb();
  try {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as any;
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status === 'received') return res.status(400).json({ error: 'Already received' });

    const items = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(req.params.id) as any[];
    const updateStock = db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?');
    const selectProduct = db.prepare('SELECT quantity FROM products WHERE id = ?');
    const insertStockLog = db.prepare(`
      INSERT INTO stock_logs (
        product_id, change_type, quantity_before, quantity_changed, quantity_after, reference_type, reference_id, notes
      ) VALUES (?, 'restock', ?, ?, ?, 'purchase_order', ?, ?)
    `);

    const applyReceive = db.transaction(() => {
      for (const item of items) {
        const before = selectProduct.get(item.product_id) as any;
        if (!before) continue;
        updateStock.run(item.quantity, item.product_id);
        insertStockLog.run(
          item.product_id,
          before.quantity,
          item.quantity,
          before.quantity + item.quantity,
          po.id,
          `Restocked via ${po.po_number}`,
        );
      }
      db.prepare(`UPDATE purchase_orders SET status = 'received' WHERE id = ?`).run(req.params.id);
    });

    applyReceive();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
