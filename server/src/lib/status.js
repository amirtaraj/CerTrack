import { DAY, todayUtc } from './dates.js';
import { config } from '../config.js';

/** valid | expiring | expired | no-expiry | unset  (unset = no expiry date recorded and not marked "no expiry") */
export function statusOf(cert, today = todayUtc()) {
  if (cert.noExpiry) return { status: 'no-expiry', daysLeft: null };
  if (!cert.expiresOn) return { status: 'unset', daysLeft: null };
  const daysLeft = Math.round((new Date(cert.expiresOn) - today) / DAY);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= config.expiringDays) return { status: 'expiring', daysLeft };
  return { status: 'valid', daysLeft };
}

/** Mongo filter equivalent of statusOf(), so list filtering matches what the UI shows. */
export function statusFilter(status, today = todayUtc()) {
  const soon = new Date(+today + config.expiringDays * DAY);
  switch (status) {
    case 'no-expiry': return { noExpiry: true };
    case 'unset':     return { noExpiry: false, expiresOn: null };
    case 'expired':   return { noExpiry: false, expiresOn: { $lt: today } };
    case 'expiring':  return { noExpiry: false, expiresOn: { $gte: today, $lte: soon } };
    case 'valid':     return { noExpiry: false, expiresOn: { $gt: soon } };
    default:          return null;
  }
}

export const STATUSES = ['valid', 'expiring', 'expired', 'no-expiry', 'unset'];
