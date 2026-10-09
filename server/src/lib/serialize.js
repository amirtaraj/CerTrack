import { toIsoDate } from './dates.js';
import { statusOf } from './status.js';

export function serializeCert(c) {
  const { status, daysLeft } = statusOf(c);
  return {
    id: String(c._id),
    userId: String(c.user),
    empId: c.empId,
    empName: c.empName ?? undefined,
    specialization: c.specialization,
    name: c.name,
    issuedOn: toIsoDate(c.issuedOn),
    expiresOn: toIsoDate(c.expiresOn),
    noExpiry: !!c.noExpiry,
    status,
    daysLeft,
    credentialUrl: c.credentialUrl || null,
    imageUrl: c.imageUrl || null,
    source: c.source,
    note: c.note || '',
  };
}

export const serializeUser = (u) => ({
  id: String(u._id),
  empId: u.empId,
  name: u.name,
  email: u.email || '',
  role: u.role,
  active: u.active,
  mustChangePassword: !!u.mustChangePassword,
  credlyUsername: u.credlyUsername || '',
  certCount: u.certCount ?? undefined,
});
