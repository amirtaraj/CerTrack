import { useState } from 'react';
import { Field, Modal } from './ui.jsx';
import { api } from '../api.js';

const blank = { specialization: '', name: '', issuedOn: '', expiresOn: '', noExpiry: false, credentialUrl: '', note: '' };

/**
 * Add/edit dialog. `save(payload)` does the API call and resolves with the saved cert;
 * `suggestions` feeds the specialization picker with values already used in the tracker.
 */
export default function CertForm({ initial, save, onSaved, onClose, suggestions = [], title }) {
  const [v, setV] = useState({ ...blank, ...(initial ? {
    specialization: initial.specialization, name: initial.name, issuedOn: initial.issuedOn || '',
    expiresOn: initial.expiresOn || '', noExpiry: initial.noExpiry, credentialUrl: initial.credentialUrl || '', note: initial.note || '',
  } : {}) });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const { cert } = await save({ ...v, expiresOn: v.noExpiry ? '' : v.expiresOn });
      onSaved(cert);
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { _: err.message });
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title || (initial ? 'Edit certification' : 'Add certification')}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" form="cert-form" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Add certification'}</button>
      </>}
    >
      <form id="cert-form" onSubmit={submit} noValidate>
        {errors._ && <div className="banner err" role="alert">{errors._}</div>}
        <Field label="Certification name" error={errors.name} htmlFor="cf-name">
          <input id="cf-name" value={v.name} onChange={set('name')} placeholder="e.g. AWS Certified Solutions Architect – Associate" autoComplete="off" />
        </Field>
        <Field label="Specialization" error={errors.specialization} htmlFor="cf-spec" hint="Pick one that's already in use or type a new one.">
          <input id="cf-spec" list="cf-spec-list" value={v.specialization} onChange={set('specialization')} placeholder="e.g. AWS, Azure, Tosca" autoComplete="off" />
          <datalist id="cf-spec-list">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <div className="row2">
          <Field label="Completed on" error={errors.issuedOn} htmlFor="cf-issued">
            <input id="cf-issued" type="date" value={v.issuedOn} onChange={set('issuedOn')} />
          </Field>
          <Field label="Expires on" error={errors.expiresOn} htmlFor="cf-exp">
            <input id="cf-exp" type="date" value={v.noExpiry ? '' : v.expiresOn} onChange={set('expiresOn')} disabled={v.noExpiry} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={v.noExpiry} onChange={set('noExpiry')} />
          <span>This certification doesn't expire</span>
        </label>
        <Field label="Credential link" error={errors.credentialUrl} htmlFor="cf-url" hint="Optional. A Credly, Pearson VUE or vendor verification link.">
          <input id="cf-url" type="url" value={v.credentialUrl} onChange={set('credentialUrl')} placeholder="https://" />
        </Field>
        <Field label="Note" error={errors.note} htmlFor="cf-note">
          <textarea id="cf-note" rows="2" value={v.note} onChange={set('note')} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}

export const mineSave = (id) => (payload) => (id ? api.updateCert(id, payload) : api.addCert(payload));
