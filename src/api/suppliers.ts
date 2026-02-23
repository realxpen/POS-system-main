import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin', 'manager']));

router.get('/', (req, res) => {
  const db = getDb();
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
  res.json(suppliers);
});

router.post('/', (req, res) => {
  const { name, email, phone, address, contact_person } = req.body;
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO suppliers (name, email, phone, address, contact_person)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email || null, phone || null, address || null, contact_person || null);
    res.json({ id: info.lastInsertRowid, name, email, phone, address, contact_person });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, email, phone, address, contact_person } = req.body;
  const db = getDb();
  try {
    db.prepare(`
      UPDATE suppliers SET name = ?, email = ?, phone = ?, address = ?, contact_person = ?
      WHERE id = ?
    `).run(name, email || null, phone || null, address || null, contact_person || null, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authorize(['admin']), (req, res) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
