import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, useToast, Empty, ErrorNote, Modal, Field } from '../components/ui.jsx';
import { useAuth } from '../auth.jsx';

function AddPerson({ onClose, onAdded }) {
  const [v, setV] = useState({ empId: '', name: '', email: '', role: 'user' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErrors({});
    try { onAdded(await api.addUser(v)); }
    catch (err) { setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { _: err.message }); setBusy(false); }
  }
  return (
    <Modal title="Add a person" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="add-person" disabled={busy}>{busy ? 'Adding…' : 'Add person'}</button></>}>
      <form id="add-person" onSubmit={submit} noValidate>
        {errors._ && <div className="banner err" role="alert">{errors._}</div>}
        <Field label="Employee ID" error={errors.empId} htmlFor="ap-id"><input id="ap-id" inputMode="numeric" value={v.empId} onChange={set('empId')} /></Field>
        <Field label="Full name" error={errors.name} htmlFor="ap-name"><input id="ap-name" value={v.name} onChange={set('name')} /></Field>
        <Field label="Email" error={errors.email} htmlFor="ap-email"><input id="ap-email" type="email" value={v.email} onChange={set('email')} /></Field>
        <Field label="Access" htmlFor="ap-role">
          <select id="ap-role" value={v.role} onChange={set('role')}><option value="user">Member: manages their own certifications</option><option value="admin">Admin: sees and edits everyone's</option></select>
        </Field>
      </form>
    </Modal>
  );
}

export default function People() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(api.users, []);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState(null); // { name, password }

  const users = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.users || []).filter((u) => !t || u.name.toLowerCase().includes(t) || u.empId.includes(t));
  }, [data, q]);

  async function patch(u, changes, message) {
    try { await api.updateUser(u.id, changes); toast(message); reload(); } catch (e) { toast(e.message, 'err'); }
  }
  async function reset(u) {
    if (!window.confirm(`Reset the password for ${u.name}? They'll have to choose a new one at next sign-in.`)) return;
    try { const r = await api.resetPassword(u.id); setSecret({ name: u.name, password: r.startingPassword }); } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>People</h1>
          {data && <p className="lede">{data.users.length} people. Everyone signs in with their employee ID.</p>}
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>Add a person</button>
      </header>

      <div className="filters">
        <div className="field grow"><label htmlFor="pp-q">Search</label><input id="pp-q" type="search" placeholder="Name or employee ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <ErrorNote error={error} retry={reload} />
      {loading && !data && <p className="muted">Loading…</p>}
      {data && users.length === 0 && <Empty title="No one matches that search" />}

      {users.length > 0 && (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Person</th><th>Access</th><th>Certifications</th><th>Account</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id} className={u.active ? '' : 'inactive'}>
                    <td data-label="Person"><strong>{u.name}</strong><div className="muted small">Emp {u.empId}{u.email ? `, ${u.email}` : ''}</div></td>
                    <td data-label="Access">{u.role === 'admin' ? 'Admin' : 'Member'}</td>
                    <td data-label="Certifications">
                      {u.certCount > 0 ? <Link to={`/admin/certs?userId=${u.id}`}>{u.certCount} {u.certCount === 1 ? 'certification' : 'certifications'}</Link> : <span className="muted">None yet</span>}
                    </td>
                    <td data-label="Account">{u.active ? (u.mustChangePassword ? <span className="muted">Hasn't signed in yet</span> : 'Active') : 'Deactivated'}</td>
                    <td className="row-actions">
                      {!self && <button className="btn small" onClick={() => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' }, u.role === 'admin' ? `${u.name} is now a member` : `${u.name} is now an admin`)}>{u.role === 'admin' ? 'Make member' : 'Make admin'}</button>}
                      <button className="btn small" onClick={() => reset(u)}>Reset password</button>
                      {!self && <button className={`btn small ${u.active ? 'danger' : ''}`} onClick={() => patch(u, { active: !u.active }, u.active ? `${u.name} deactivated` : `${u.name} reactivated`)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddPerson onClose={() => setAdding(false)} onAdded={(r) => { setAdding(false); setSecret({ name: r.user.name, password: r.startingPassword }); reload(); }} />}
      {secret && (
        <Modal title={`Starting password for ${secret.name}`} onClose={() => setSecret(null)} footer={<button className="btn primary" onClick={() => setSecret(null)}>Done</button>}>
          <p style={{ marginTop: 0 }}>Share this with them privately. They'll be asked to choose their own password the first time they sign in.</p>
          <p className="secret">{secret.password}</p>
        </Modal>
      )}
    </>
  );
}
