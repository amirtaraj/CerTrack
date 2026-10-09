import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { statusOf, statusFilter } from '../src/lib/status.js';
import { parseDateCell, cleanName, canonSpecialization, parseWorkbook } from '../src/lib/importer.js';
import { certInput } from '../src/lib/validation.js';
import { parseProfileSlug, mapBadge, fetchCredlyBadges, CredlyError, guessSpecialization } from '../src/lib/credly.js';
import { Certification, certKey } from '../src/models/Certification.js';
import { todayUtc, DAY } from '../src/lib/dates.js';
import { config } from '../src/config.js';

const d = (offsetDays) => new Date(+todayUtc() + offsetDays * DAY);

test('status: boundaries match the 90-day window', () => {
  assert.equal(statusOf({ noExpiry: true }).status, 'no-expiry');
  assert.equal(statusOf({ noExpiry: false, expiresOn: null }).status, 'unset');
  assert.equal(statusOf({ expiresOn: d(-1) }).status, 'expired');
  assert.equal(statusOf({ expiresOn: d(0) }).status, 'expiring');   // expires today = still held, but urgent
  assert.equal(statusOf({ expiresOn: d(90) }).status, 'expiring');
  assert.equal(statusOf({ expiresOn: d(91) }).status, 'valid');
  assert.equal(statusOf({ expiresOn: d(-3) }).daysLeft, -3);
});

test('status filter mirrors statusOf boundaries', () => {
  const t = todayUtc();
  assert.deepEqual(statusFilter('expired').expiresOn, { $lt: t });
  assert.deepEqual(statusFilter('expiring').expiresOn, { $gte: t, $lte: d(config.expiringDays) });
  assert.deepEqual(statusFilter('valid').expiresOn, { $gt: d(config.expiringDays) });
  assert.equal(statusFilter('bogus'), null);
});

test('spreadsheet date cells: dates, serials, DD/MM/YYYY, no-expiry, blanks, impossible dates', () => {
  assert.deepEqual(parseDateCell(new Date(Date.UTC(2026, 5, 15))), { kind: 'date', value: '2026-06-15' });
  assert.deepEqual(parseDateCell(46246), { kind: 'date', value: '2026-08-12' });
  assert.deepEqual(parseDateCell('27/09/2028'), { kind: 'date', value: '2028-09-27' });
  assert.deepEqual(parseDateCell('5/1/2027'), { kind: 'date', value: '2027-01-05' }); // day first, not month first
  assert.equal(parseDateCell('No Expiry').kind, 'none');
  assert.equal(parseDateCell(' no expiry ').kind, 'none');
  assert.equal(parseDateCell(null).kind, 'blank');
  assert.equal(parseDateCell('').kind, 'blank');
  assert.equal(parseDateCell('31/09/2025').kind, 'bad');
  assert.equal(parseDateCell('soon').kind, 'bad');
});

test('names and specializations are normalised', () => {
  assert.equal(cleanName('Kumar, Balram'), 'Balram Kumar');
  assert.equal(cleanName('  H S  Darshini \u00a0'), 'H S Darshini');
  assert.equal(canonSpecialization('AZURE'), 'Azure');
  assert.equal(canonSpecialization('Perfromance'), 'Performance');
  assert.equal(canonSpecialization('Copilot'), 'GitHub');
  assert.equal(canonSpecialization('Something New'), 'Something New');
});

test('real spreadsheet: counts, merges and flagged problems', async () => {
  const p = await parseWorkbook(new URL('../seed/Active_Certifications.xlsx', import.meta.url).pathname);
  assert.equal(p.rowsRead, 157);
  assert.equal(p.people.length, 87);
  assert.equal(p.certs.length, 154);
  const priya = p.certs.find((c) => c.empId === '5726' && /cloud practitioner/i.test(c.name));
  assert.equal(priya.expiresOn, '2029-06-15'); // later expiry kept when a duplicate row had expiry == completion date
  assert.ok(p.issues.some((i) => /31\/09\/2025/.test(i.message)));
  assert.ok(p.certs.every((c) => /^\d+$/.test(c.empId)));
  assert.ok(p.certs.every((c) => !(c.noExpiry && c.expiresOn)));
});

test('cert validation: trims, blanks, bad dates, expiry before issue, non-http links', () => {
  const ok = certInput.parse({ specialization: ' AWS ', name: ' AWS AI Practitioner ', issuedOn: '2026-01-31', expiresOn: '', noExpiry: false, credentialUrl: '' });
  assert.equal(ok.name, 'AWS AI Practitioner');
  assert.equal(ok.expiresOn, null);
  assert.equal(ok.credentialUrl, null);
  assert.throws(() => certInput.parse({ specialization: 'AWS', name: 'X cert', issuedOn: '2026-02-31' }));
  assert.throws(() => certInput.parse({ specialization: 'AWS', name: 'X cert', issuedOn: '2026-05-01', expiresOn: '2026-04-01' }));
  assert.throws(() => certInput.parse({ specialization: 'AWS', name: 'X cert', credentialUrl: 'javascript:alert(1)' }));
  assert.doesNotThrow(() => certInput.parse({ specialization: 'AWS', name: 'X cert', issuedOn: '2026-05-01', expiresOn: '2020-01-01', noExpiry: true }));
});

test('model: nameKey ignores case/punctuation; noExpiry clears expiry date', async () => {
  assert.equal(certKey('AWS Certified Cloud-Practitioner (2025)'), certKey('aws certified cloud practitioner 2025'));
  const c = new Certification({ user: new mongoose.Types.ObjectId(), empId: '1', specialization: 'AWS', name: 'Foo Bar', noExpiry: true, expiresOn: new Date() });
  await c.validate();
  assert.equal(c.expiresOn, null);
  assert.equal(c.nameKey, 'foobar');
});

test('credly: profile parsing blocks anything that is not a plain slug', () => {
  assert.equal(parseProfileSlug('https://www.credly.com/users/Jane-Doe.1a2b3c4d/badges'), 'jane-doe.1a2b3c4d');
  assert.equal(parseProfileSlug('jane-doe.1a2b'), 'jane-doe.1a2b');
  for (const bad of ['', 'http://evil.test/x', '../../etc/passwd', 'a b', 'x/../../y', 'https://credly.com.evil.test/users/a/../../b']) {
    assert.throws(() => parseProfileSlug(bad), CredlyError, bad);
  }
});

test('credly: maps badges, drops pending ones, follows pagination, handles 404', async () => {
  const badge = (id, state = 'accepted', extra = {}) => ({
    id, state, issued_at_date: '2025-06-15', expires_at_date: '2028-06-15',
    badge_template: { name: `Badge ${id}`, image_url: 'https://images.credly.com/x.png', issuer: { entities: [{ entity: { name: 'Amazon Web Services Training and Certification' } }] } }, ...extra,
  });
  const pages = {
    'https://www.credly.com/users/jane.1/badges.json?sort=-state_updated_at': { data: [badge('a'), badge('b', 'pending')], metadata: { next_page_url: '/users/jane.1/badges.json?page=2' } },
    'https://www.credly.com/users/jane.1/badges.json?page=2': { data: [badge('c', 'accepted', { expires_at_date: null })], metadata: {} },
  };
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    if (url.includes('/users/ghost')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(pages[url] || { data: [] }), { status: 200 });
  };
  try {
    const { badges } = await fetchCredlyBadges('https://www.credly.com/users/jane.1');
    assert.deepEqual(badges.map((b) => b.id), ['a', 'c']);
    assert.equal(badges[0].specialization, 'AWS');
    assert.equal(badges[0].expiresOn, '2028-06-15');
    assert.equal(badges[1].expiresOn, null);
    assert.equal(badges[0].credentialUrl, 'https://www.credly.com/badges/a');
    assert.ok(seen.every((u) => u.startsWith('https://www.credly.com/')));
    await assert.rejects(fetchCredlyBadges('ghost.1'), /public profile/);
  } finally { globalThis.fetch = real; }
  assert.equal(guessSpecialization('Scaled Agile, Inc.', 'SAFe 6 Scrum Master'), 'Safe Scrum');
  assert.equal(mapBadge({ id: 'z', badge_template: { name: 'N' } }).expiresOn, null);
});

test('http: health, auth gates, bad input — without a database', async () => {
  mongoose.set('bufferCommands', false);
  const { app } = await import('../src/index.js');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/api/health`)).json()).db, false);
    assert.equal((await fetch(`${base}/api/me/certs`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/summary`)).status, 401);
    const forged = jwt.sign({ sub: 'x' }, 'wrong-secret');
    assert.equal((await fetch(`${base}/api/admin/summary`, { headers: { cookie: `ct_token=${forged}` } })).status, 401);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"empId":' });
    assert.equal(bad.status, 400);
    const empty = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(empty.status, 400);
    assert.ok((await empty.json()).fields);
  } finally { server.close(); }
});
