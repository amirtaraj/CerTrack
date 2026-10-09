import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Certification } from '../models/Certification.js';
import { certInput, empIdRule } from '../lib/validation.js';
import { serializeCert, serializeUser } from '../lib/serialize.js';
import { statusFilter, STATUSES } from '../lib/status.js';
import { DAY, todayUtc, parseIsoDate, toIsoDate } from '../lib/dates.js';
import { parseWorkbook, applyImport } from '../lib/importer.js';
import { config } from '../config.js';

const router = Router(); // mounted at /api/admin after requireAuth + requirePasswordSet + requireAdmin
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ----------------------------- Overview ----------------------------- */

router.get('/summary', async (req, res) => {
  const today = todayUtc();
  const windowEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, 1));

  const [counts, bySpec, monthly, activePeople, certHolders, total] = await Promise.all([
    Promise.all(STATUSES.map(async (s) => [s, await Certification.countDocuments(statusFilter(s, today))])),
    Certification.aggregate([
      { $group: { _id: '$specialization', certs: { $sum: 1 }, people: { $addToSet: '$user' } } },
      { $project: { _id: 0, specialization: '$_id', certs: 1, people: { $size: '$people' } } },
      { $sort: { certs: -1 } },
    ]),
    Certification.aggregate([
      { $match: { noExpiry: false, expiresOn: { $gte: today } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$expiresOn' } }, count: { $sum: 1 } } },
    ]),
    User.countDocuments({ active: true }),
    Certification.distinct('user'),
    Certification.countDocuments({}),
  ]);

  const byMonth = new Map(monthly.map((m) => [m._id, m.count]));
  const status = Object.fromEntries(counts);
  // Each bucket carries the exact filter the client should use, so a bar's count always matches its list.
  const runway = [{ key: 'overdue', label: 'Lapsed', count: status.expired, status: 'expired' }];
  let inWindow = 0;
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const key = d.toISOString().slice(0, 7);
    const count = byMonth.get(key) || 0;
    inWindow += count;
    runway.push({
      key, count, label: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(),
      from: toIsoDate(i === 0 ? today : d), to: toIsoDate(last), soon: i * 30 < config.expiringDays,
    });
  }
  const later = [...byMonth.values()].reduce((a, b) => a + b, 0) - inWindow;
  runway.push({ key: 'later', label: 'Later', count: later, from: toIsoDate(windowEnd) });

  res.json({
    totals: { certifications: total, people: activePeople, peopleWithCerts: certHolders.length, peopleWithoutCerts: Math.max(0, activePeople - certHolders.length) },
    status, bySpecialization: bySpec, runway, expiringDays: config.expiringDays,
  });
});

/* ----------------------- Certifications list ----------------------- */

const SORTS = { person: 'empName', empId: 'empId', cert: 'name', specialization: 'specialization', issued: 'issuedOn', expires: 'expiresOn' };

function listPipeline(q) {
  const and = [];
  if (q.userId && mongoose.isValidObjectId(q.userId)) and.push({ user: oid(q.userId) });
  if (q.specialization) and.push({ specialization: String(q.specialization) });
  const sf = q.status && statusFilter(String(q.status));
  if (sf) and.push(sf);
  const from = parseIsoDate(q.expiresFrom), to = parseIsoDate(q.expiresTo);
  if (from || to) and.push({ noExpiry: false, expiresOn: { ...(from && { $gte: from }), ...(to && { $lte: to }) } });

  const pipeline = [];
  if (and.length) pipeline.push({ $match: { $and: and } });
  pipeline.push(
    { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    { $addFields: { empName: '$u.name' } },
    { $project: { u: 0 } }
  );
  const search = String(q.search || '').trim().slice(0, 80);
  if (search) {
    const re = new RegExp(escapeRe(search), 'i');
    pipeline.push({ $match: { $or: [{ name: re }, { specialization: re }, { empName: re }, { empId: re }] } });
  }
  const field = SORTS[q.sort] || 'expiresOn';
  const dir = q.order === 'desc' ? -1 : 1;
  pipeline.push({ $sort: { [field]: dir, _id: 1 } });
  return pipeline;
}

router.get('/certs', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 25));
  const [out] = await Certification.aggregate([
    ...listPipeline(req.query),
    { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);
  const total = out.total[0]?.n || 0;
  res.json({ certs: out.rows.map(serializeCert), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export.csv', async (req, res) => {
  const rows = (await Certification.aggregate([...listPipeline(req.query), { $limit: 50000 }])).map(serializeCert);
  const head = ['Emp ID', 'Name', 'Specialization', 'Certification', 'Completed', 'Expires', 'Status', 'Source', 'Credential link'];
  const lines = [head.join(',')].concat(
    rows.map((c) => [c.empId, c.empName, c.specialization, c.name, c.issuedOn, c.noExpiry ? 'No expiry' : c.expiresOn, c.status, c.source, c.credentialUrl].map(csvCell).join(','))
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="certifications-${toIsoDate(new Date())}.csv"`);
  res.send('\ufeff' + lines.join('\r\n'));
});

/* ----------------- Certification edits by admins ----------------- */

router.post('/users/:id/certs', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Person');
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('Person');
  const cert = await Certification.create({ ...certInput.parse(req.body), user: user._id, empId: user.empId, source: 'manual' });
  res.status(201).json({ cert: serializeCert({ ...cert.toObject(), empName: user.name }) });
});

router.put('/certs/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Certification');
  const cert = await Certification.findById(req.params.id);
  if (!cert) throw notFound('Certification');
  cert.set(certInput.parse(req.body));
  await cert.save();
  res.json({ cert: serializeCert(cert.toObject()) });
});

router.delete('/certs/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Certification');
  const r = await Certification.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw notFound('Certification');
  res.json({ ok: true });
});

/* ------------------------------ People ------------------------------ */

router.get('/users', async (req, res) => {
  const counts = await Certification.aggregate([{ $group: { _id: '$user', n: { $sum: 1 } } }]);
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]));
  const users = await User.find({}).sort({ name: 1 }).lean();
  res.json({ users: users.map((u) => serializeUser({ ...u, certCount: byUser.get(String(u._id)) || 0 })) });
});

router.post('/users', async (req, res) => {
  const body = z.object({
    empId: empIdRule,
    name: z.string().trim().min(2).max(120),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]).optional(),
    role: z.enum(['admin', 'user']).default('user'),
  }).parse(req.body);
  if (await User.exists({ empId: body.empId })) {
    return res.status(409).json({ error: 'Validation failed', fields: { empId: 'Someone with this employee ID already exists' } });
  }
  const user = await User.create({
    ...body, email: body.email || undefined,
    passwordHash: await bcrypt.hash(config.defaultPassword, 10), mustChangePassword: true,
  });
  res.status(201).json({ user: serializeUser(user), startingPassword: config.defaultPassword });
});

router.patch('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Person');
  const body = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]).optional(),
    role: z.enum(['admin', 'user']).optional(),
    active: z.boolean().optional(),
  }).parse(req.body);

  const user = await User.findById(req.params.id);
  if (!user) throw notFound('Person');
  const isSelf = String(user._id) === String(req.user._id);
  if (isSelf && (body.role === 'user' || body.active === false)) {
    return res.status(400).json({ error: 'You can\'t remove your own admin access or deactivate yourself.' });
  }
  if (body.name !== undefined) user.name = body.name;
  if (body.email !== undefined) user.email = body.email || undefined;
  if (body.role !== undefined) user.role = body.role;
  if (body.active !== undefined) user.active = body.active;
  await user.save();
  res.json({ user: serializeUser(user) });
});

router.post('/users/:id/reset-password', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Person');
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw notFound('Person');
  user.passwordHash = await bcrypt.hash(config.defaultPassword, 10);
  user.mustChangePassword = true;
  await user.save();
  res.json({ startingPassword: config.defaultPassword });
});

/* ------------------------------ Import ------------------------------ */

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an .xlsx file to import.' });
  if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Only .xlsx files are supported.' });
  let parsed;
  try {
    parsed = await parseWorkbook(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'That file couldn\'t be read as an Excel workbook.' });
  }
  const result = await applyImport(parsed, {
    dryRun: req.query.dryRun === '1', defaultPassword: config.defaultPassword, User, Certification,
  });
  res.json({ result });
});

export default router;
