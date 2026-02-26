import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*,
           (
             SELECT MAX(maintenance_date)
             FROM asset_maintenance_logs aml
             WHERE aml.asset_id = a.id
           ) as last_maintenance_date
    FROM assets a
    ORDER BY a.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const db = getDb();
  const { name, category, purchase_cost, purchase_date, condition, maintenance_interval_days, expected_lifespan_months, notes } = req.body;
  try {
    const info = db.prepare(`
      INSERT INTO assets (
        name, category, purchase_cost, purchase_date, condition,
        maintenance_interval_days, expected_lifespan_months, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      category || null,
      Number(purchase_cost || 0),
      purchase_date || null,
      condition || 'good',
      maintenance_interval_days ? Number(maintenance_interval_days) : null,
      expected_lifespan_months ? Number(expected_lifespan_months) : null,
      notes || null,
    );
    res.json({ id: info.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, category, purchase_cost, purchase_date, condition, maintenance_interval_days, expected_lifespan_months, notes } = req.body;
  db.prepare(`
    UPDATE assets
    SET name = ?, category = ?, purchase_cost = ?, purchase_date = ?, condition = ?,
        maintenance_interval_days = ?, expected_lifespan_months = ?, notes = ?
    WHERE id = ?
  `).run(
    name,
    category || null,
    Number(purchase_cost || 0),
    purchase_date || null,
    condition || 'good',
    maintenance_interval_days ? Number(maintenance_interval_days) : null,
    expected_lifespan_months ? Number(expected_lifespan_months) : null,
    notes || null,
    req.params.id,
  );
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/:id/maintenance', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM asset_maintenance_logs
    WHERE asset_id = ?
    ORDER BY maintenance_date DESC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/:id/maintenance', (req, res) => {
  const db = getDb();
  const { maintenance_date, cost, description } = req.body;
  const assetId = Number(req.params.id);
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO asset_maintenance_logs (asset_id, maintenance_date, cost, description)
      VALUES (?, ?, ?, ?)
    `).run(assetId, maintenance_date || new Date().toISOString().slice(0, 10), Number(cost || 0), description || null);

    db.prepare(`
      INSERT INTO expenses (title, category, amount, date, payment_method, notes, updated_at)
      VALUES (?, 'Maintenance', ?, ?, 'cash', ?, CURRENT_TIMESTAMP)
    `).run(
      `Maintenance - Asset #${assetId}`,
      Number(cost || 0),
      maintenance_date || new Date().toISOString().slice(0, 10),
      description || null,
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
