import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, useDebounced, useToast, StatusPill, SpecTag, Empty, ErrorNote, Modal, Field } from '../components/ui.jsx';
import CertForm from '../components/CertForm.jsx';
import { CertName, ExpiryCell } from './MyCerts.jsx';
import { STATUS_LABEL, fmtDate } from '../format.js';
import { useEffect } from 'react';

const COLS = [
  ['person', 'Person'], ['cert', 'Certification'], ['specialization', 'Specialization'], ['issued', 'Completed'], ['expires', 'Expires'],
];

export default function AdminCerts() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const get = (k, d = '') => sp.get(k) ?? d;
  const [search, setSearch] = useState(get('search'));
  const debounced = useDebounced(search);
  useEffect(() => { patch({ search: debounced, page: '' }); /* eslint-disable-next-line */ }, [debounced]);

  const params = {
    search: get('search'), specialization: get('specialization'), status: get('status'), userId: get('userId'),
    expiresFrom: get('expiresFrom'), expiresTo: get('expiresTo'),
    sort: get('sort', 'expires'), order: get('order', 'asc'), page: get('page', '1'), limit: 25,
  };

  function patch(changes) {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
      return n;
    }, { replace: true });
  }

  const { data, error, loading, reload } = useAsync(() => api.adminCerts(params), [sp.toString()]);
  const specs = useAsync(api.specializations, []);
  const people = useAsync(api.users, []);
  const [editing, setEditing] = useState(null); // 'new' | cert
  const [removing, setRemoving] = useState(null);
  const [adding, setAdding] = useState(null); // user id chosen for a new cert

  const certs = data?.certs || [];
  const filtered = ['search', 'specialization', 'status', 'userId', 'expiresFrom', 'expiresTo'].some((k) => params[k]);
  const person = people.data?.users.find((u) => u.id === params.userId);

  const sortBy = (key) => patch({ sort: key, order: params.sort === key && params.order === 'asc' ? 'desc' : 'asc', page: '' });
  const ariaSort = (key) => (params.sort === key ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none');

  async function remove() {
    try { await api.adminDeleteCert(removing.id); toast('Certification removed'); setRemoving(null); reload(); }
    catch (e) { toast(e.message, 'err'); setRemoving(null); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>All certifications</h1>
          {data && <p className="lede">{data.total} {data.total === 1 ? 'result' : 'results'}{filtered ? ' for these filters' : ''}{person ? `, showing ${person.name} only` : ''}.</p>}
        </div>
        <div className="actions">
          <a className="btn" href={api.exportUrl(params)}>Export CSV</a>
          <button className="btn primary" onClick={() => setAdding('pick')}>Add certification</button>
        </div>
      </header>

      <div className="filters">
        <div className="field grow"><label htmlFor="f-search">Search</label>
          <input id="f-search" type="search" placeholder="Name, employee ID or certification" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field"><label htmlFor="f-spec">Specialization</label>
          <select id="f-spec" value={params.specialization} onChange={(e) => patch({ specialization: e.target.value, page: '' })}>
            <option value="">All</option>
            {(specs.data?.specializations || []).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="f-status">Status</label>
          <select id="f-status" value={params.status} onChange={(e) => patch({ status: e.target.value, page: '' })}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {filtered && <button className="btn small" onClick={() => { setSearch(''); setSp({}, { replace: true }); }}>Clear filters</button>}
      </div>
      {(params.expiresFrom || params.expiresTo) && (
        <p className="muted small">Expiring {params.expiresFrom ? `from ${fmtDate(params.expiresFrom)} ` : ''}{params.expiresTo ? `to ${fmtDate(params.expiresTo)}` : 'onwards'}.</p>
      )}

      <ErrorNote error={error} retry={reload} />
      {loading && !data && <p className="muted">Loading…</p>}

      {data && certs.length === 0 && (
        <Empty title={filtered ? 'No certifications match' : 'No certifications yet'}>
          {filtered ? 'Try removing a filter or searching for something shorter.' : 'Import a spreadsheet or add one with the button above.'}
        </Empty>
      )}

      {certs.length > 0 && (
        <div className={`table-wrap ${loading ? 'dim' : ''}`}>
          <table className="table stack">
            <thead>
              <tr>
                {COLS.map(([k, l]) => (
                  <th key={k} aria-sort={ariaSort(k)}>
                    <button className="th-btn" onClick={() => sortBy(k)}>{l}<span aria-hidden="true">{params.sort === k ? (params.order === 'asc' ? ' ↑' : ' ↓') : ''}</span></button>
                  </th>
                ))}
                <th>Status</th><th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td data-label="Person"><strong>{c.empName}</strong><div className="muted small">Emp {c.empId}</div></td>
                  <td data-label="Certification"><CertName c={c} /></td>
                  <td data-label="Specialization"><SpecTag name={c.specialization} /></td>
                  <td data-label="Completed">{fmtDate(c.issuedOn) || <span className="muted">Not set</span>}</td>
                  <td data-label="Expires"><ExpiryCell c={c} /></td>
                  <td data-label="Status"><StatusPill status={c.status} /></td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setEditing(c)}>Edit</button>
                    <button className="btn small danger" onClick={() => setRemoving(c)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn small" disabled={data.page <= 1} onClick={() => patch({ page: String(data.page - 1) })}>Previous</button>
          <span className="muted">Page {data.page} of {data.pages}</span>
          <button className="btn small" disabled={data.page >= data.pages} onClick={() => patch({ page: String(data.page + 1) })}>Next</button>
        </nav>
      )}

      {adding === 'pick' && (
        <Modal title="Who is this certification for?" onClose={() => setAdding(null)}>
          <Field label="Person" htmlFor="pick-user">
            <select id="pick-user" defaultValue="" onChange={(e) => e.target.value && setAdding(e.target.value)}>
              <option value="" disabled>Choose a person</option>
              {(people.data?.users || []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.empId})</option>)}
            </select>
          </Field>
        </Modal>
      )}
      {adding && adding !== 'pick' && (
        <CertForm title="Add certification" suggestions={specs.data?.specializations}
          save={(p) => api.adminAddCert(adding, p)} onClose={() => setAdding(null)}
          onSaved={() => { toast('Certification added'); setAdding(null); reload(); }} />
      )}
      {editing && (
        <CertForm initial={editing} title={`Edit certification for ${editing.empName}`} suggestions={specs.data?.specializations}
          save={(p) => api.adminUpdateCert(editing.id, p)} onClose={() => setEditing(null)}
          onSaved={() => { toast('Changes saved'); setEditing(null); reload(); }} />
      )}
      {removing && (
        <Modal title="Remove this certification?" onClose={() => setRemoving(null)}
          footer={<><button className="btn" onClick={() => setRemoving(null)}>Keep it</button><button className="btn danger-solid" onClick={remove}>Remove certification</button></>}>
          <p style={{ margin: 0 }}><strong>{removing.name}</strong> will be removed from {removing.empName}'s list.</p>
        </Modal>
      )}
    </>
  );
}
