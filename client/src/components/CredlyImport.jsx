import { useState } from 'react';
import { Modal } from './ui.jsx';
import { api } from '../api.js';
import { fmtDate } from '../format.js';
import { SpecTag } from './ui.jsx';

export default function CredlyImport({ initialProfile = '', onClose, onDone }) {
  const [profile, setProfile] = useState(initialProfile);
  const [badges, setBadges] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function find(e) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.credlyPreview(profile);
      setBadges(r.badges);
      setPicked(new Set(r.badges.filter((b) => !b.alreadyAdded).map((b) => b.id)));
    } catch (err) { setError(err.message); setBadges(null); }
    setBusy(false);
  }

  async function add() {
    setBusy(true); setError('');
    try {
      const r = await api.credlyImport(profile, [...picked]);
      onDone(r);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addable = badges?.filter((b) => !b.alreadyAdded) || [];

  return (
    <Modal
      title="Add from Credly" onClose={onClose} wide
      footer={badges ? <>
        <button className="btn" onClick={() => setBadges(null)}>Back</button>
        <button className="btn primary" onClick={add} disabled={busy || !picked.size}>
          {busy ? 'Adding…' : `Add ${picked.size} ${picked.size === 1 ? 'certification' : 'certifications'}`}
        </button>
      </> : <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="credly-form" disabled={busy || profile.trim().length < 2}>{busy ? 'Finding badges…' : 'Find badges'}</button>
      </>}
    >
      {error && <div className="banner err" role="alert">{error}</div>}
      {!badges ? (
        <form id="credly-form" onSubmit={find}>
          <div className="field">
            <label htmlFor="cr-profile">Your Credly profile link</label>
            <input id="cr-profile" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="https://www.credly.com/users/your-name" autoComplete="off" />
            <p className="field-msg">Open your Credly profile, copy the address from the browser, and paste it here. Your profile needs to be set to public so we can read your badges. We only read badges, and nothing is changed on Credly.</p>
          </div>
        </form>
      ) : badges.length === 0 ? (
        <p className="muted">No accepted badges were found on this profile.</p>
      ) : (
        <>
          <div className="pick-head">
            <span>{badges.length} {badges.length === 1 ? 'badge' : 'badges'} found{badges.length - addable.length ? `, ${badges.length - addable.length} already in your list` : ''}</span>
            {addable.length > 1 && (
              <button className="link" onClick={() => setPicked(picked.size === addable.length ? new Set() : new Set(addable.map((b) => b.id)))}>
                {picked.size === addable.length ? 'Clear selection' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="badge-list">
            {badges.map((b) => (
              <li key={b.id} className={b.alreadyAdded ? 'is-added' : ''}>
                <label>
                  <input type="checkbox" disabled={b.alreadyAdded} checked={picked.has(b.id)} onChange={() => toggle(b.id)} />
                  {b.imageUrl ? <img src={b.imageUrl} alt="" width="40" height="40" loading="lazy" referrerPolicy="no-referrer" /> : <span className="badge-ph" />}
                  <span className="badge-main">
                    <strong>{b.name}</strong>
                    <span className="muted small">
                      {b.issuer && `${b.issuer}. `}
                      {b.issuedOn ? `Issued ${fmtDate(b.issuedOn)}. ` : ''}
                      {b.expiresOn ? `Expires ${fmtDate(b.expiresOn)}.` : 'No expiry.'}
                    </span>
                  </span>
                  {b.alreadyAdded ? <span className="muted small">Already added</span> : <SpecTag name={b.specialization} />}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
