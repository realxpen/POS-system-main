import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/init';
import { authenticate, SECRET_KEY } from './middleware/auth';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, branch_id: user.branch_id || 1 },
    SECRET_KEY,
    { expiresIn: '24h' }
  );

  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, branch_id: user.branch_id || 1 } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  authenticate(req, res, () => {
    res.json({ user: req.user });
  });
});

export default router;
