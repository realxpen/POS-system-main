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
  const {
    supplier_id,
    branch_id,
    items,
    notes,
    vat_charged,
    vat_rate,
    input_vat_amount,
    supplier_vat_invoice_no,
    supplier_tin,
    is_claimable_input_vat,
  } = req.body;
  const db = getDb();
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  try {
    const result = db.transaction(() => {
      const poNumber = makePoNumber();
      let totalCost = 0;

      const poInfo = db.prepare(`
        INSERT INTO purchase_orders (
          po_number, supplier_id, branch_id, status, total_cost, total_cost_inc_vat,
          vat_charged, vat_rate, input_vat_amount, supplier_vat_invoice_no, supplier_tin,
          is_claimable_input_vat, notes
        )
        VALUES (?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        poNumber,
        Number(supplier_id),
        Number(branch_id || req.user?.branch_id || 1),
        vat_charged ? 1 : 0,
        Number(vat_rate || 7.5),
        Number(input_vat_amount || 0),
        supplier_vat_invoice_no || null,
        supplier_tin || null,
        is_claimable_input_vat === false ? 0 : 1,
        notes || null,
      );
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

      const resolvedVatRate = Number(vat_rate || 7.5);
      const computedVat = vat_charged ? (Number(input_vat_amount || 0) || (totalCost * (resolvedVatRate / 100))) : 0;
      const totalIncVat = totalCost + computedVat;
      db.prepare(`
        UPDATE purchase_orders
        SET total_cost = ?, input_vat_amount = ?, total_cost_inc_vat = ?, vat_rate = ?, vat_charged = ?
        WHERE id = ?
      `).run(totalCost, computedVat, totalIncVat, resolvedVatRate, vat_charged ? 1 : 0, purchaseOrderId);
      return { id: purchaseOrderId, po_number: poNumber, total_cost: totalCost };
    })();

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/input-vat-summary', (req, res) => {
  const db = getDb();
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = ? THEN input_vat_amount END), 0) as total_input_vat_month,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = ? AND is_claimable_input_vat = 1 THEN input_vat_amount END), 0) as claimable_input_vat_month,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = ? AND is_claimable_input_vat = 0 THEN input_vat_amount END), 0) as non_claimable_input_vat_month
    FROM purchase_orders
    WHERE status != 'cancelled'
  `).get(month, month, month);

  const rows = db.prepare(`
    SELECT po.id, po.po_number, po.created_at, po.input_vat_amount, po.vat_rate, po.vat_charged, po.is_claimable_input_vat, po.supplier_vat_invoice_no, po.supplier_tin, s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE strftime('%Y-%m', po.created_at) = ? AND po.vat_charged = 1
    ORDER BY po.created_at DESC
  `).all(month);
  res.json({ month, summary, rows });
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
