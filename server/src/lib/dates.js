export const DAY = 24 * 60 * 60 * 1000;

export function todayUtc() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export const toIsoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** 'YYYY-MM-DD' -> Date at UTC midnight, or null. Rejects impossible dates (e.g. 2026-02-31). */
export function parseIsoDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}
