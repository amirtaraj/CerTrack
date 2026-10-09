export class ApiError extends Error {
  constructor(message, status, fields, code) { super(message); this.status = status; this.fields = fields || {}; this.code = code; }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError('Can\'t reach the server. Check your connection.', 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status, data.fields, data.code);
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => v !== '' && v != null && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (empId, password) => request('POST', '/api/auth/login', { empId, password }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  changePassword: (current, next) => request('POST', '/api/auth/change-password', { current, next }),

  myCerts: () => request('GET', '/api/me/certs'),
  addCert: (c) => request('POST', '/api/me/certs', c),
  updateCert: (id, c) => request('PUT', `/api/me/certs/${id}`, c),
  deleteCert: (id) => request('DELETE', `/api/me/certs/${id}`),
  updateProfile: (p) => request('PATCH', '/api/me/profile', p),
  credlyPreview: (profile) => request('POST', '/api/me/credly/preview', { profile }),
  credlyImport: (profile, badgeIds) => request('POST', '/api/me/credly/import', { profile, badgeIds }),

  summary: () => request('GET', '/api/admin/summary'),
  adminCerts: (params) => request('GET', `/api/admin/certs${qs(params)}`),
  specializations: () => request('GET', '/api/me/specializations'),
  exportUrl: (params) => `/api/admin/export.csv${qs(params)}`,
  adminAddCert: (userId, c) => request('POST', `/api/admin/users/${userId}/certs`, c),
  adminUpdateCert: (id, c) => request('PUT', `/api/admin/certs/${id}`, c),
  adminDeleteCert: (id) => request('DELETE', `/api/admin/certs/${id}`),
  users: () => request('GET', '/api/admin/users'),
  addUser: (u) => request('POST', '/api/admin/users', u),
  updateUser: (id, patch) => request('PATCH', `/api/admin/users/${id}`, patch),
  resetPassword: (id) => request('POST', `/api/admin/users/${id}/reset-password`),
  importSheet: (file, dryRun) => {
    const fd = new FormData(); fd.append('file', file);
    return request('POST', `/api/admin/import${dryRun ? '?dryRun=1' : ''}`, fd);
  },
};
