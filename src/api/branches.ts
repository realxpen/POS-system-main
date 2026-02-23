import { Router } from 'express';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = getDb();
  const branches = db.prepare('SELECT * FROM branches ORDER BY name').all();
  res.json(branches);
});

router.post('/', authorize(['admin']), (req, res) => {
  const { name, code, address, is_active } = req.body;
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO branches (name, code, address, is_active)
      VALUES (?, ?, ?, ?)
    `).run(name, code, address || null, is_active === false ? 0 : 1);
    res.json({ id: info.lastInsertRowid, name, code, address, is_active: is_active === false ? 0 : 1 });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authorize(['admin']), (req, res) => {
  const { name, code, address, is_active } = req.body;
  const db = getDb();
  try {
    db.prepare(`
      UPDATE branches
      SET name = ?, code = ?, address = ?, is_active = ?
      WHERE id = ?
    `).run(name, code, address || null, is_active === false ? 0 : 1, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
