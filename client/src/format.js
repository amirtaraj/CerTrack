const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};

export function expiryText(c) {
  if (c.status === 'no-expiry') return 'No expiry';
  if (c.status === 'unset') return 'Not set';
  return fmtDate(c.expiresOn);
}

export function relativeText(c) {
  if (c.daysLeft == null) return '';
  const n = Math.abs(c.daysLeft);
  const unit = n === 1 ? 'day' : 'days';
  if (c.daysLeft === 0) return 'today';
  if (n > 60) {
    const months = Math.round(n / 30.4);
    return c.daysLeft < 0 ? `${months} months ago` : `in ${months} months`;
  }
  return c.daysLeft < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
}

export const STATUS_LABEL = {
  valid: 'Valid', expiring: 'Expiring soon', expired: 'Lapsed', 'no-expiry': 'No expiry', unset: 'Expiry missing',
};

const PROVIDER_COLORS = {
  aws: '#E08A1E', azure: '#2A7DE1', gcp: '#2E9B5B', github: '#2B3138', tosca: '#D4483B',
  automation: '#8A5CD0', 'safe scrum': '#0F8F9B', salesforce: '#1798C1', istqb: '#B8498A', oracle: '#C23B3B',
  microsoft: '#3C67C9', performance: '#7A8A2E',
};
export function providerColor(name = '') {
  const k = name.toLowerCase();
  if (PROVIDER_COLORS[k]) return PROVIDER_COLORS[k];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 42%)`;
}
