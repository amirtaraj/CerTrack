import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { config } from './config.js';
import { User } from './models/User.js';
import { Certification } from './models/Certification.js';
import { requireAuth, requireAdmin, requirePasswordSet } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import adminRoutes from './routes/admin.js';
import { CredlyError } from './lib/credly.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'], // Credly badge images are served from Credly's CDN
      scriptSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/auth', authRoutes);
app.use('/api/me', requireAuth, requirePasswordSet, meRoutes);
app.use('/api/admin', requireAuth, requirePasswordSet, requireAdmin, adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built client in production (single-origin deploy).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    const fields = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    return res.status(400).json({ error: 'Validation failed', fields });
  }
  if (err instanceof CredlyError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 11000) return res.status(409).json({ error: 'Validation failed', fields: { name: 'This certification is already on the list for this person' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  if (err?.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 5 MB.' : 'Upload failed.' });
  if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

async function ensureAdmin() {
  if (!config.adminEmpId || !config.adminPassword) return;
  if (await User.exists({ role: 'admin' })) return;
  const existing = await User.findOne({ empId: config.adminEmpId });
  if (existing) { existing.role = 'admin'; await existing.save(); return console.log(`Promoted ${existing.empId} to admin.`); }
  await User.create({
    empId: config.adminEmpId, name: config.adminName, role: 'admin',
    passwordHash: await bcrypt.hash(config.adminPassword, 10), mustChangePassword: true,
  });
  console.log(`Created admin ${config.adminEmpId}. They'll set a new password at first sign-in.`);
}

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await Promise.all([User.init(), Certification.init()]); // make sure unique indexes exist before serving
  await ensureAdmin();
  app.listen(config.port, () => console.log(`Certification tracker on http://localhost:${config.port}`));
}
