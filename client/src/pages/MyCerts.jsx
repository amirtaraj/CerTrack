import { useState } from 'react';
import { api } from '../api.js';
import { useAsync, useToast, StatusPill, SpecTag, Empty, ErrorNote, Modal } from '../components/ui.jsx';
import CertForm, { mineSave } from '../components/CertForm.jsx';
import CredlyImport from '../components/CredlyImport.jsx';
import { useAuth } from '../auth.jsx';
import { expiryText, fmtDate, relativeText } from '../format.js';

export function CertName({ c }) {
  return (
    <div className="cert-name">
      {c.imageUrl && <img src={c.imageUrl} alt="" width="36" height="36" loading="lazy" referrerPolicy="no-referrer" />}
      <div>
        {c.credentialUrl ? <a href={c.credentialUrl} target="_blank" rel="noopener noreferrer">{c.name}</a> : <span>{c.name}</span>}
        {c.source === 'credly' && <span className="muted small"> via Credly</span>}
        {c.note && <div className="muted small">{c.note}</div>}
      </div>
    </div>
  );
}

export function ExpiryCell({ c }) {
  return (
    <>
      <div>{expiryText(c)}</div>
      {(c.status === 'expiring' || c.status === 'expired') && <div className="muted small">{relativeText(c)}</div>}
    </>
  );
}

export default function MyCerts() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(api.myCerts, []);
  const specs = useAsync(() => api.specializations().catch(() => ({ specializations: [] })), []);
  const [editing, setEditing] = useState(null); // null | 'new' | cert
  const [credly, setCredly] = useState(false);
  const [removing, setRemoving] = useState(null);

  const certs = data?.certs || [];
  const soon = certs.filter((c) => c.status === 'expiring').length;
  const lapsed = certs.filter((c) => c.status === 'expired').length;
  const missing = certs.filter((c) => c.status === 'unset').length;

  const suggestions = [...new Set([...(specs.data?.specializations || []), ...certs.map((c) => c.specialization), 'AWS', 'Azure', 'GCP', 'GitHub', 'Tosca', 'Safe Scrum', 'Salesforce', 'ISTQB'])].sort();

  async function remove() {
    try { await api.deleteCert(removing.id); toast(`Removed ${removing.name}`); setRemoving(null); reload(); }
    catch (e) { toast(e.message, 'err'); setRemoving(null); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My certifications</h1>
          {!loading && !error && (
            <p className="lede">
              {certs.length === 0 ? 'Nothing here yet.' : `${certs.length} ${certs.length === 1 ? 'certification' : 'certifications'}.`}
              {lapsed > 0 && ` ${lapsed} ${lapsed === 1 ? 'has' : 'have'} lapsed.`}
              {soon > 0 && ` ${soon} ${soon === 1 ? 'expires' : 'expire'} soon.`}
              {missing > 0 && ` ${missing} ${missing === 1 ? 'needs' : 'need'} an expiry date.`}
            </p>
          )}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setCredly(true)}>Add from Credly</button>
          <button className="btn primary" onClick={() => setEditing('new')}>Add certification</button>
        </div>
      </header>

      <ErrorNote error={error} retry={reload} />
      {loading && <p className="muted">Loading…</p>}

      {!loading && !error && certs.length === 0 && (
        <Empty title="Add your first certification">Enter one by hand, or pull in your badges from Credly in a few clicks.</Empty>
      )}

      {certs.length > 0 && (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Certification</th><th>Specialization</th><th>Completed</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
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

      {editing && (
        <CertForm
          initial={editing === 'new' ? null : editing}
          suggestions={suggestions}
          save={mineSave(editing === 'new' ? null : editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { toast(editing === 'new' ? 'Certification added' : 'Changes saved'); setEditing(null); reload(); }}
        />
      )}
      {credly && (
        <CredlyImport
          initialProfile={user.credlyUsername ? `https://www.credly.com/users/${user.credlyUsername}` : ''}
          onClose={() => setCredly(false)}
          onDone={(r) => {
            toast(`Added ${r.created.length} ${r.created.length === 1 ? 'certification' : 'certifications'} from Credly${r.skipped.length ? `, skipped ${r.skipped.length} already on your list` : ''}`);
            setCredly(false); reload(); api.me().then((m) => setUser(m.user)).catch(() => {});
          }}
        />
      )}
      {removing && (
        <Modal title="Remove this certification?" onClose={() => setRemoving(null)}
          footer={<><button className="btn" onClick={() => setRemoving(null)}>Keep it</button><button className="btn danger-solid" onClick={remove}>Remove certification</button></>}>
          <p style={{ margin: 0 }}><strong>{removing.name}</strong> will be removed from your list. You can add it again later.</p>
        </Modal>
      )}
    </>
  );
}
