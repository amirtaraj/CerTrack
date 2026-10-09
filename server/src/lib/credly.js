/**
 * Credly integration (public-profile import).
 *
 * Reads the badges a person has chosen to make public on Credly. Credly's public profile
 * pages are backed by `https://www.credly.com/users/<profile-slug>/badges.json`. This is the
 * endpoint Credly's own site uses; it is not a versioned/contracted API, so everything below
 * is parsed defensively and failures are reported to the user in plain language.
 *
 * SSRF note: the host is fixed and the profile slug is validated to [a-z0-9._-], so users
 * cannot point the server at arbitrary URLs.
 */
const HOST = 'https://www.credly.com';

export class CredlyError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function parseProfileSlug(input) {
  const raw = String(input || '').trim();
  const m = /credly\.com\/users\/([^/?#\s]+)/i.exec(raw);
  const slug = (m ? m[1] : raw).replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,100}$/.test(slug)) {
    throw new CredlyError('That doesn\'t look like a Credly profile. Paste the link from your Credly profile page (it looks like credly.com/users/your-name).', 400);
  }
  return slug;
}

const dateOnly = (v) => {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null;
  return m ? m[1] : null;
};

const PROVIDERS = [
  [/amazon|aws/i, 'AWS'],
  [/microsoft|azure/i, 'Azure'],
  [/google|gcp/i, 'GCP'],
  [/github/i, 'GitHub'],
  [/tricentis|tosca/i, 'Tosca'],
  [/scaled agile|safe\b/i, 'Safe Scrum'],
  [/salesforce/i, 'Salesforce'],
  [/istqb/i, 'ISTQB'],
  [/oracle/i, 'Oracle'],
];
export function guessSpecialization(issuer, badgeName) {
  const hay = `${issuer} ${badgeName}`;
  for (const [re, label] of PROVIDERS) if (re.test(hay)) return label;
  return issuer || 'Other';
}

export function mapBadge(b) {
  const t = b.badge_template || {};
  const issuer =
    b.issuer?.entities?.[0]?.entity?.name || t.issuer?.entities?.[0]?.entity?.name || b.issuer_name || '';
  const name = t.name || b.name || '';
  return {
    id: String(b.id),
    name,
    issuer,
    specialization: guessSpecialization(issuer, name),
    issuedOn: dateOnly(b.issued_at_date) || dateOnly(b.issued_at),
    expiresOn: dateOnly(b.expires_at_date) || dateOnly(b.expires_at),
    imageUrl: t.image_url || t.image?.url || b.image_url || null,
    credentialUrl: `${HOST}/badges/${encodeURIComponent(b.id)}`,
    state: b.state || 'accepted',
  };
}

export async function fetchCredlyBadges(profileInput) {
  const slug = parseProfileSlug(profileInput);
  const out = [];
  let url = `${HOST}/users/${slug}/badges.json?sort=-state_updated_at`;

  for (let page = 0; page < 10 && url; page++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'certtrack/1.0' },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
    } catch {
      throw new CredlyError('Couldn\'t reach Credly. Check the server\'s internet access and try again.');
    }
    if (res.status === 404) throw new CredlyError('Credly has no public profile with that link. Check the spelling, and make sure your profile is set to public.', 404);
    if (res.status === 429) throw new CredlyError('Credly is rate-limiting us. Wait a minute and try again.', 429);
    if (!res.ok) throw new CredlyError(`Credly returned an error (${res.status}). Try again shortly.`);
    let body;
    try { body = await res.json(); } catch { throw new CredlyError('Credly sent a response we couldn\'t read.'); }

    const list = Array.isArray(body?.data) ? body.data : [];
    out.push(...list);
    const next = String(body?.metadata?.next_page_url || '');
    if (next.startsWith('/')) url = `${HOST}${next}`;
    else if (next.startsWith(`${HOST}/`)) url = next;
    else url = null;
  }

  return { slug, badges: out.map(mapBadge).filter((b) => b.name && b.state === 'accepted') };
}
