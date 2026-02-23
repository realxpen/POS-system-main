import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/init';
import { authenticate, authorize } from './middleware/auth';

const router = Router();
router.use(authenticate);
router.use(authorize(['admin']));

router.get('/', (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, full_name, role, branch_id, created_at FROM users').all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { username, password, full_name, role, branch_id } = req.body;
  const db = getDb();
  
  try {
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as any;
    if (!roleRow) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
      INSERT INTO users (username, password, full_name, role, role_id, branch_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(username, hashedPassword, full_name, role, roleRow.id, Number(branch_id || 1));
    res.json({ id: info.lastInsertRowid, username, full_name, role, branch_id: Number(branch_id || 1) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  try {
    // Prevent deleting the last admin
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any).count;
    const userToDelete = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;

    if (userToDelete.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin" });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
