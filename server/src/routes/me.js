import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Certification, certKey } from '../models/Certification.js';
import { User } from '../models/User.js';
import { certInput } from '../lib/validation.js';
import { serializeCert, serializeUser } from '../lib/serialize.js';
import { parseProfileSlug, fetchCredlyBadges, CredlyError } from '../lib/credly.js';
import { parseIsoDate } from '../lib/dates.js';

const router = Router(); // mounted at /api/me, after requireAuth + requirePasswordSet

router.get('/certs', async (req, res) => {
  const certs = await Certification.find({ user: req.user._id }).sort({ expiresOn: 1, name: 1 }).lean();
  res.json({ certs: certs.map(serializeCert) });
});

router.get('/specializations', async (req, res) => {
  res.json({ specializations: (await Certification.distinct('specialization')).sort((a, b) => a.localeCompare(b)) });
});

router.post('/certs', async (req, res) => {
  const data = certInput.parse(req.body);
  const cert = await Certification.create({ ...data, user: req.user._id, empId: req.user.empId, source: 'manual' });
  res.status(201).json({ cert: serializeCert(cert.toObject()) });
});

router.put('/certs/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Certification not found.' });
  const data = certInput.parse(req.body);
  const cert = await Certification.findOne({ _id: req.params.id, user: req.user._id });
  if (!cert) return res.status(404).json({ error: 'Certification not found.' });
  cert.set(data);
  await cert.save();
  res.json({ cert: serializeCert(cert.toObject()) });
});

router.delete('/certs/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Certification not found.' });
  const r = await Certification.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Certification not found.' });
  res.json({ ok: true });
});

router.patch('/profile', async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]).optional(),
    credlyUsername: z.string().trim().max(200).optional(),
  }).parse(req.body);
  const user = await User.findById(req.user._id);
  if (body.name !== undefined) user.name = body.name;
  if (body.email !== undefined) user.email = body.email || undefined;
  if (body.credlyUsername !== undefined) user.credlyUsername = body.credlyUsername ? parseProfileSlug(body.credlyUsername) : undefined;
  await user.save();
  res.json({ user: serializeUser(user) });
});

/* ------------------------- Credly ------------------------- */

router.post('/credly/preview', async (req, res) => {
  const { profile } = z.object({ profile: z.string().trim().min(2) }).parse(req.body);
  const { slug, badges } = await fetchCredlyBadges(profile);
  const mine = await Certification.find({ user: req.user._id }, 'credlyBadgeId nameKey name').lean();
  const haveBadge = new Set(mine.map((c) => c.credlyBadgeId).filter(Boolean));
  const haveName = new Set(mine.map((c) => c.nameKey));
  res.json({
    slug,
    badges: badges.map((b) => ({ ...b, alreadyAdded: haveBadge.has(b.id) || haveName.has(certKey(b.name)) })),
  });
});

router.post('/credly/import', async (req, res) => {
  const { profile, badgeIds } = z.object({
    profile: z.string().trim().min(2),
    badgeIds: z.array(z.string().min(1)).min(1, 'Select at least one badge').max(200),
  }).parse(req.body);

  // Re-fetch rather than trusting browser-supplied badge data.
  const { slug, badges } = await fetchCredlyBadges(profile);
  const wanted = new Set(badgeIds);
  const picked = badges.filter((b) => wanted.has(b.id));

  const created = [];
  const skipped = [];
  for (const b of picked) {
    try {
      const cert = await Certification.create({
        user: req.user._id, empId: req.user.empId,
        specialization: b.specialization, name: b.name,
        issuedOn: parseIsoDate(b.issuedOn), expiresOn: parseIsoDate(b.expiresOn),
        noExpiry: !b.expiresOn,
        credentialUrl: b.credentialUrl, imageUrl: b.imageUrl, credlyBadgeId: b.id, source: 'credly',
      });
      created.push(serializeCert(cert.toObject()));
    } catch (e) {
      if (e?.code === 11000) skipped.push(b.name); else throw e;
    }
  }
  await User.updateOne({ _id: req.user._id }, { credlyUsername: slug });
  res.status(201).json({ created, skipped });
});

export default router;
export { CredlyError };
