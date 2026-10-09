import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { parseIsoDate } from './dates.js';
import { certKey } from '../models/Certification.js';

/* ------------------------------------------------------------------ *
 *  Cell cleaning helpers – the source sheet mixes Excel dates, serial
 *  numbers and DD/MM/YYYY text in the same column.
 * ------------------------------------------------------------------ */

const cellText = (v) => {
  if (v == null) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return String(v.text);
  }
  return String(v);
};

const clean = (s) => cellText(s).replace(/[\u00a0\s]+/g, ' ').trim();

const NO_EXPIRY = /^(no[\s-]*expiry|never|lifetime|n\/?a|none|-+|nil)$/i;

const fromSerial = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

/** -> { kind: 'date', value:'YYYY-MM-DD' } | { kind:'none' } | { kind:'blank' } | { kind:'bad', raw } */
export function parseDateCell(v) {
  if (v == null || (typeof v === 'string' && !v.trim())) return { kind: 'blank' };
  if (v instanceof Date) return Number.isNaN(+v) ? { kind: 'bad', raw: String(v) } : { kind: 'date', value: iso(v) };
  if (typeof v === 'number') return v > 20000 && v < 80000 ? { kind: 'date', value: iso(fromSerial(v)) } : { kind: 'bad', raw: String(v) };
  const s = clean(v);
  if (NO_EXPIRY.test(s)) return { kind: 'none' };
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // DD/MM/YYYY (the sheet's stated format)
  if (m) {
    const d = parseIsoDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    return d ? { kind: 'date', value: iso(d) } : { kind: 'bad', raw: s };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && parseIsoDate(m[0])) return { kind: 'date', value: m[0] };
  if (/^\d{5}$/.test(s)) return { kind: 'date', value: iso(fromSerial(Number(s))) };
  return { kind: 'bad', raw: s };
}

const SPEC_CANON = {
  tosca: 'Tosca', aws: 'AWS', azure: 'Azure', gcp: 'GCP', github: 'GitHub', copilot: 'GitHub',
  'safe scrum': 'Safe Scrum', salesforce: 'Salesforce', istqb: 'ISTQB', oracle: 'Oracle',
  microsoft: 'Microsoft', automation: 'Automation', perfromance: 'Performance', performance: 'Performance',
};
export const canonSpecialization = (raw) => {
  const s = clean(raw);
  return SPEC_CANON[s.toLowerCase()] || s;
};

/** "Kumar, Balram" -> "Balram Kumar" */
export function cleanName(raw) {
  const s = clean(raw);
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : s;
}

const HEADERS = [
  ['empId', /emp.*id/i],
  ['name', /^emp.*name|^name/i],
  ['specialization', /special|categor|provider|vendor/i],
  ['cert', /certif/i],
  ['issued', /complet|issue|date.*obtain/i],
  ['expires', /expir|valid.*till|valid.*until/i],
];

/* ------------------------------------------------------------------ *
 *  Parse a workbook buffer/path into normalised, de-duplicated records
 * ------------------------------------------------------------------ */
export async function parseWorkbook(source) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source);
  else await wb.xlsx.readFile(source);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no sheets.');

  const headerRow = ws.getRow(1);
  const col = {};
  headerRow.eachCell((cell, n) => {
    const text = clean(cell.value);
    for (const [key, re] of HEADERS) if (col[key] == null && re.test(text)) { col[key] = n; break; }
  });
  const missing = ['empId', 'name', 'cert'].filter((k) => col[k] == null);
  if (missing.length) throw new Error(`Couldn't find the column(s): ${missing.join(', ')}. Expected headers like "EMP ID", "EMP Name", "Certification Name".`);

  const issues = []; // { row, level: 'warn'|'skip', message }
  const merged = new Map(); // `${empId}|${certKey}` -> record
  const namesById = new Map(); // empId -> Map(name -> count)
  const idsByName = new Map(); // lower name -> Set(empId)
  let rowsRead = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k) => (col[k] != null ? row.getCell(col[k]).value : null);
    const empId = clean(get('empId')).replace(/\D/g, '');
    const certName = clean(get('cert'));
    const rawName = clean(get('name'));
    if (!empId && !certName && !rawName) continue; // blank line
    rowsRead++;
    if (!empId) { issues.push({ row: r, level: 'skip', message: 'No employee ID' }); continue; }
    if (!certName) { issues.push({ row: r, level: 'skip', message: `Emp ${empId}: no certification name` }); continue; }
    if (!rawName) { issues.push({ row: r, level: 'skip', message: `Emp ${empId}: no employee name` }); continue; }

    const name = cleanName(rawName);
    if (!namesById.has(empId)) namesById.set(empId, new Map());
    namesById.get(empId).set(name, (namesById.get(empId).get(name) || 0) + 1);
    const lower = name.toLowerCase();
    if (!idsByName.has(lower)) idsByName.set(lower, new Set());
    idsByName.get(lower).add(empId);

    const issued = parseDateCell(get('issued'));
    const expires = parseDateCell(get('expires'));
    if (issued.kind === 'bad') issues.push({ row: r, level: 'warn', message: `Emp ${empId}: couldn't read completion date "${issued.raw}" – left blank` });
    if (expires.kind === 'bad') issues.push({ row: r, level: 'warn', message: `Emp ${empId}: couldn't read expiry date "${expires.raw}" – left blank` });

    const rec = {
      empId,
      specialization: canonSpecialization(get('specialization')) || 'Other',
      name: certName,
      issuedOn: issued.kind === 'date' ? issued.value : null,
      expiresOn: expires.kind === 'date' ? expires.value : null,
      noExpiry: expires.kind === 'none',
      row: r,
    };

    const key = `${empId}|${certKey(certName)}`;
    const prev = merged.get(key);
    if (!prev) { merged.set(key, rec); continue; }
    // Duplicate: keep the entry with the later expiry (a lifetime cert wins), fill any gaps from the other.
    const best = rank(rec) > rank(prev) ? rec : prev;
    const other = best === rec ? prev : rec;
    best.issuedOn ||= other.issuedOn;
    if (!best.noExpiry) best.expiresOn ||= other.expiresOn;
    merged.set(key, best);
    issues.push({ row: r, level: 'warn', message: `Emp ${empId}: "${certName}" appears twice (rows ${prev.row} and ${r}) – merged, kept the later expiry` });
  }

  const people = new Map();
  for (const [empId, names] of namesById) {
    const sorted = [...names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    people.set(empId, sorted[0][0]);
    if (names.size > 1) issues.push({ row: null, level: 'warn', message: `Emp ${empId} appears under ${names.size} spellings (${[...names.keys()].join(' / ')}) – using "${sorted[0][0]}"` });
  }
  for (const [lower, ids] of idsByName) {
    if (ids.size > 1) issues.push({ row: null, level: 'warn', message: `"${lower}" has ${ids.size} different employee IDs (${[...ids].join(', ')}) – imported as separate people, please confirm` });
  }

  return {
    rowsRead,
    people: [...people].map(([empId, name]) => ({ empId, name })),
    certs: [...merged.values()],
    issues,
  };
}

const rank = (r) => (r.noExpiry ? Infinity : r.expiresOn ? Date.parse(r.expiresOn) : -1);

/* ------------------------------------------------------------------ *
 *  Apply to MongoDB. Existing people/certs are never overwritten, so
 *  edits made in the app always win over a re-import.
 * ------------------------------------------------------------------ */
export async function applyImport(parsed, { dryRun, defaultPassword, User, Certification }) {
  const existingUsers = await User.find({ empId: { $in: parsed.people.map((p) => p.empId) } }, 'empId').lean();
  const haveUser = new Map(existingUsers.map((u) => [u.empId, u._id]));
  const newPeople = parsed.people.filter((p) => !haveUser.has(p.empId));

  const result = {
    rowsRead: parsed.rowsRead,
    people: parsed.people.length,
    usersCreated: newPeople.length,
    certsInFile: parsed.certs.length,
    certsCreated: 0,
    certsSkippedExisting: 0,
    issues: parsed.issues,
    dryRun: !!dryRun,
  };

  if (!dryRun && newPeople.length) {
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const created = await User.insertMany(
      newPeople.map((p) => ({ empId: p.empId, name: p.name, passwordHash, mustChangePassword: true, role: 'user' }))
    );
    created.forEach((u) => haveUser.set(u.empId, u._id));
  }

  const existingCerts = haveUser.size
    ? await Certification.find({ user: { $in: [...haveUser.values()] } }, 'user nameKey').lean()
    : [];
  const haveCert = new Set(existingCerts.map((c) => `${c.user}|${c.nameKey}`));

  const toInsert = [];
  for (const c of parsed.certs) {
    const userId = haveUser.get(c.empId);
    const nameKey = certKey(c.name);
    if (userId && haveCert.has(`${userId}|${nameKey}`)) { result.certsSkippedExisting++; continue; }
    result.certsCreated++;
    if (!dryRun) {
      toInsert.push({
        user: userId, empId: c.empId, specialization: c.specialization, name: c.name, nameKey,
        issuedOn: c.issuedOn ? new Date(c.issuedOn) : null,
        expiresOn: c.expiresOn ? new Date(c.expiresOn) : null,
        noExpiry: c.noExpiry, source: 'import',
      });
    }
  }
  if (toInsert.length) await Certification.insertMany(toInsert, { ordered: false });
  return result;
}
