import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate } from './middleware/auth';

const router = Router();
router.use(authenticate);

function makeDraftCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DRAFT-${y}${m}${day}-${rand}`;
}

router.get('/', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const rows = user.role === 'attendant'
    ? db.prepare(`
        SELECT * FROM draft_invoices
        WHERE attendant_id = ?
        ORDER BY status = 'open' DESC, updated_at DESC
      `).all(user.id)
    : db.prepare(`
        SELECT * FROM draft_invoices
        ORDER BY status = 'open' DESC, updated_at DESC
      `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const { customer_name } = req.body;
  try {
    const code = makeDraftCode();
    const info = db.prepare(`
      INSERT INTO draft_invoices (invoice_code, customer_name, status, attendant_id, attendant_name, branch_id, updated_at)
      VALUES (?, ?, 'open', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      code,
      customer_name || 'Walk-in',
      user.id,
      user.full_name,
      user.branch_id || 1,
    );
    res.json({ id: info.lastInsertRowid, invoice_code: code });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const draft = db.prepare('SELECT * FROM draft_invoices WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Draft invoice not found' });
  if (user.role === 'attendant' && draft.attendant_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  const items = db.prepare(`
    SELECT * FROM draft_invoice_items
    WHERE draft_invoice_id = ?
    ORDER BY id
  `).all(req.params.id);
  res.json({ ...draft, items });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const draft = db.prepare('SELECT * FROM draft_invoices WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Draft invoice not found' });
  if (user.role === 'attendant' && draft.attendant_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  const { customer_name, status, transaction_id, invoice_id } = req.body;
  db.prepare(`
    UPDATE draft_invoices
    SET customer_name = ?,
        status = COALESCE(?, status),
        transaction_id = COALESCE(?, transaction_id),
        invoice_id = COALESCE(?, invoice_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(customer_name || draft.customer_name, status || null, transaction_id || null, invoice_id || null, req.params.id);
  res.json({ success: true });
});

router.post('/:id/items', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const { product_id, quantity } = req.body;

  const draft = db.prepare('SELECT * FROM draft_invoices WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Draft invoice not found' });
  if (draft.status !== 'open') return res.status(400).json({ error: 'Draft invoice is not open' });
  if (user.role === 'attendant' && draft.attendant_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id) as any;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const configuredVat = db.prepare('SELECT tax_rate FROM tax_settings WHERE id = 1').get() as any;
  const vatRate = Number(configuredVat?.tax_rate || 7.5);
  const unitPriceWithVat = Number(product.selling_price) * (1 + vatRate / 100);

  const qty = Math.max(1, Number(quantity || 1));
  const existing = db.prepare(`
    SELECT * FROM draft_invoice_items
    WHERE draft_invoice_id = ? AND product_id = ?
  `).get(req.params.id, product_id) as any;

  if (existing) {
    const nextQty = existing.quantity + qty;
    db.prepare(`
      UPDATE draft_invoice_items
      SET quantity = ?, subtotal = ?, unit_price = ?
      WHERE id = ?
    `).run(nextQty, nextQty * unitPriceWithVat, unitPriceWithVat, existing.id);
  } else {
    db.prepare(`
      INSERT INTO draft_invoice_items (draft_invoice_id, product_id, product_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, product_id, product.name, qty, unitPriceWithVat, qty * unitPriceWithVat);
  }
  db.prepare(`UPDATE draft_invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

router.put('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  const { quantity } = req.body;
  const draft = db.prepare('SELECT * FROM draft_invoices WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Draft invoice not found' });
  if (draft.status !== 'open') return res.status(400).json({ error: 'Draft invoice is not open' });
  const item = db.prepare('SELECT * FROM draft_invoice_items WHERE id = ?').get(req.params.itemId) as any;
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const qty = Math.max(1, Number(quantity || 1));
  db.prepare(`
    UPDATE draft_invoice_items
    SET quantity = ?, subtotal = ? * unit_price
    WHERE id = ?
  `).run(qty, qty, req.params.itemId);
  db.prepare(`UPDATE draft_invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

router.delete('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  const draft = db.prepare('SELECT * FROM draft_invoices WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Draft invoice not found' });
  if (draft.status !== 'open') return res.status(400).json({ error: 'Draft invoice is not open' });
  db.prepare('DELETE FROM draft_invoice_items WHERE id = ?').run(req.params.itemId);
  db.prepare(`UPDATE draft_invoices SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM draft_invoices WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

export default router;
