import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';

export const COOKIE = 'ct_token';

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: '8h' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 60 * 60 * 1000, path: '/',
  });
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Please sign in.' });
    req.user = user; // role is read fresh from the DB on every request
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only admins can do that.' });
  next();
}

/** Blocks everything except password change until a starting password has been replaced. */
export function requirePasswordSet(req, res, next) {
  if (req.user.mustChangePassword) return res.status(403).json({ error: 'Set a new password first.', code: 'PASSWORD_CHANGE_REQUIRED' });
  next();
}
