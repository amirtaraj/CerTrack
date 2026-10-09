import { useState } from 'react';
import { Field } from './ui.jsx';
import { api } from '../api.js';

export default function PasswordForm({ onDone, submitLabel = 'Update password', currentLabel = 'Current password' }) {
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (v.next !== v.confirm) return setErrors({ confirm: 'The two passwords don\'t match' });
    setBusy(true); setErrors({});
    try { const r = await api.changePassword(v.current, v.next); setV({ current: '', next: '', confirm: '' }); onDone(r.user); }
    catch (err) { setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { _: err.message }); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} noValidate>
      {errors._ && <div className="banner err" role="alert">{errors._}</div>}
      <Field label={currentLabel} error={errors.current} htmlFor="pw-cur"><input id="pw-cur" type="password" autoComplete="current-password" value={v.current} onChange={set('current')} /></Field>
      <Field label="New password" error={errors.next} htmlFor="pw-new" hint="At least 8 characters, with a letter and a number."><input id="pw-new" type="password" autoComplete="new-password" value={v.next} onChange={set('next')} /></Field>
      <Field label="Confirm new password" error={errors.confirm} htmlFor="pw-conf"><input id="pw-conf" type="password" autoComplete="new-password" value={v.confirm} onChange={set('confirm')} /></Field>
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
