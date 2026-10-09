import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, useToast } from '../components/ui.jsx';
import PasswordForm from '../components/PasswordForm.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({ name: user.name, email: user.email, credlyUsername: user.credlyUsername ? `https://www.credly.com/users/${user.credlyUsername}` : '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try { const r = await api.updateProfile(v); setUser(r.user); toast('Profile saved'); }
    catch (err) { setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { credlyUsername: err.message }); }
    setBusy(false);
  }

  return (
    <>
      <header className="page-head"><div><h1>Profile and password</h1></div></header>
      <div className="two-col">
        <section className="panel">
          <h2>Your details</h2>
          <form onSubmit={save} noValidate>
            <Field label="Employee ID" htmlFor="p-id"><input id="p-id" value={user.empId} disabled /></Field>
            <Field label="Name" error={errors.name} htmlFor="p-name"><input id="p-name" value={v.name} onChange={set('name')} /></Field>
            <Field label="Email" error={errors.email} htmlFor="p-email"><input id="p-email" type="email" value={v.email} onChange={set('email')} /></Field>
            <Field label="Credly profile link" error={errors.credlyUsername} htmlFor="p-credly" hint="Saved so next time you can pull in new badges with one click.">
              <input id="p-credly" value={v.credlyUsername} onChange={set('credlyUsername')} placeholder="https://www.credly.com/users/your-name" />
            </Field>
            <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
          </form>
        </section>
        <section className="panel">
          <h2>Change password</h2>
          <PasswordForm onDone={(u) => { setUser(u); toast('Password updated'); }} />
        </section>
      </div>
    </>
  );
}
