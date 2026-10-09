import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { COOKIE, issueSession, requireAuth } from '../middleware/auth.js';
import { passwordRule } from '../lib/validation.js';
import { serializeUser } from '../lib/serialize.js';
import { config } from '../config.js';

const router = Router();
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { empId, password } = z.object({ empId: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ empId: empId.replace(/\D/g, '') || empId }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !user.active || !ok) return res.status(401).json({ error: 'Employee ID or password is incorrect.' });
  issueSession(res, user);
  res.json({ user: serializeUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: serializeUser(req.user) }));

router.post('/change-password', requireAuth, async (req, res) => {
  const body = z.object({ current: z.string().min(1), next: passwordRule }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(body.current, user.passwordHash))) {
    return res.status(400).json({ error: 'Validation failed', fields: { current: 'Current password is incorrect' } });
  }
  if (body.next === body.current) {
    return res.status(400).json({ error: 'Validation failed', fields: { next: 'Choose a password you haven\'t used here before' } });
  }
  if (body.next === config.defaultPassword) {
    return res.status(400).json({ error: 'Validation failed', fields: { next: 'Choose a different password' } });
  }
  user.passwordHash = await bcrypt.hash(body.next, 10);
  user.mustChangePassword = false;
  await user.save();
  res.json({ user: serializeUser(user) });
});

export default router;
