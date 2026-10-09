import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(empId, password); } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="mark" aria-hidden="true">✓</span><span>Certification tracker</span></div>
        <h1>Sign in</h1>
        <p className="muted">Use your employee ID. If it's your first time, your admin will have given you a starting password.</p>
        {error && <div className="banner err" role="alert">{error}</div>}
        <Field label="Employee ID" htmlFor="l-id"><input id="l-id" inputMode="numeric" autoComplete="username" value={empId} onChange={(e) => setEmpId(e.target.value)} autoFocus /></Field>
        <Field label="Password" htmlFor="l-pw"><input id="l-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="btn primary block" disabled={busy || !empId || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
