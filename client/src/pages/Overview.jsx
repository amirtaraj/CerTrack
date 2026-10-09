import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, ErrorNote, SpecTag, StatusPill, Empty } from '../components/ui.jsx';
import { STATUS_LABEL, expiryText, relativeText } from '../format.js';

const ORDER = ['valid', 'expiring', 'expired', 'no-expiry', 'unset'];

function bucketQuery(b) {
  if (b.status) return { status: b.status, sort: 'expires', order: 'asc' };
  return { expiresFrom: b.from, expiresTo: b.to, sort: 'expires', order: 'asc' };
}

function Runway({ data, picked, onPick }) {
  const max = Math.max(1, ...data.runway.filter((b) => b.key !== 'later').map((b) => b.count));
  return (
    <div className="runway" role="group" aria-label="Certifications by expiry month">
      {data.runway.map((b, i) => {
        const tone = b.key === 'overdue' ? 'lapsed' : b.key === 'later' ? 'later' : b.soon ? 'soon' : 'ahead';
        const showYear = b.year && (i === 1 || b.label === 'Jan');
        return (
          <button key={b.key} type="button" className={`col ${tone} ${picked === b.key ? 'on' : ''}`} aria-pressed={picked === b.key}
            onClick={() => onPick(picked === b.key ? null : b.key)} disabled={b.count === 0}
            aria-label={`${b.label}${b.year ? ` ${b.year}` : ''}: ${b.count} expiring`}>
            <span className="n">{b.count}</span>
            <span className="bar-track"><span className="bar" style={b.key === 'later' ? undefined : { height: `${Math.max(b.count ? 6 : 1, (b.count / max) * 100)}%` }} /></span>
            <span className="lbl">{b.label}</span>
            <span className="yr">{showYear ? b.year : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Queue({ bucket }) {
  const q = bucketQuery(bucket);
  const { data, error, loading } = useAsync(() => api.adminCerts({ ...q, limit: 8 }), [bucket.key]);
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  return (
    <div className="queue">
      <div className="queue-head">
        <h3>{bucket.key === 'overdue' ? 'Lapsed certifications' : bucket.key === 'later' ? 'Expiring after the next 12 months' : `Expiring in ${bucket.label} ${bucket.year}`}</h3>
        {data && data.total > 8 && <Link to={`/admin/certs?${params}`}>See all {data.total}</Link>}
      </div>
      <ErrorNote error={error} />
      {loading && <p className="muted">Loading…</p>}
      {data && (
        <ul className="queue-list">
          {data.certs.map((c) => (
            <li key={c.id}>
              <div><strong>{c.empName}</strong> <span className="muted small">Emp {c.empId}</span></div>
              <div>{c.name}</div>
              <div className="queue-when">{expiryText(c)} <span className="muted small">{relativeText(c)}</span></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Overview() {
  const { data, error, loading, reload } = useAsync(api.summary, []);
  const [picked, setPicked] = useState(null);

  if (loading) return <><header className="page-head"><div><h1>Overview</h1></div></header><p className="muted">Loading…</p></>;
  if (error) return <><header className="page-head"><div><h1>Overview</h1></div></header><ErrorNote error={error} retry={reload} /></>;

  const { totals, status, bySpecialization, runway } = data;
  const bucket = runway.find((b) => b.key === picked);
  const maxSpec = Math.max(1, ...bySpecialization.map((s) => s.certs));
  const attention = status.expiring + status.expired;

  if (totals.certifications === 0) {
    return (
      <>
        <header className="page-head"><div><h1>Overview</h1></div></header>
        <Empty title="No certifications yet">
          Import your existing spreadsheet from <Link to="/admin/import">Import spreadsheet</Link>, or ask people to sign in and add their own.
        </Empty>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="lede">
            {totals.certifications} certifications held by {totals.peopleWithCerts} of {totals.people} people.
            {attention > 0 ? ` ${status.expired} lapsed and ${status.expiring} expiring within ${data.expiringDays} days need follow-up.` : ' Nothing needs renewal right now.'}
            {totals.peopleWithoutCerts > 0 && ` ${totals.peopleWithoutCerts} ${totals.peopleWithoutCerts === 1 ? 'person has' : 'people have'} none recorded.`}
          </p>
        </div>
        <a className="btn" href={api.exportUrl({})}>Export all as CSV</a>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Expiry runway</h2>
          <p className="muted small">Certifications by the month they expire. Select a bar to see who is affected. "Later" is shown off scale.</p>
        </div>
        <Runway data={data} picked={picked} onPick={setPicked} />
        {bucket && <Queue bucket={bucket} />}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Status</h2>
          <div className="statusbar" role="img" aria-label={ORDER.map((s) => `${STATUS_LABEL[s]} ${status[s]}`).join(', ')}>
            {ORDER.filter((s) => status[s] > 0).map((s) => <span key={s} className={`seg seg-${s}`} style={{ flexGrow: status[s] }} />)}
          </div>
          <ul className="legend">
            {ORDER.map((s) => (
              <li key={s}>
                <Link to={`/admin/certs?status=${s}`}><StatusPill status={s} /> <strong>{status[s]}</strong></Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>By specialization</h2>
          <ul className="spec-list">
            {bySpecialization.map((s) => (
              <li key={s.specialization}>
                <Link to={`/admin/certs?specialization=${encodeURIComponent(s.specialization)}`}>
                  <SpecTag name={s.specialization} />
                  <span className="spec-bar"><span style={{ width: `${(s.certs / maxSpec) * 100}%` }} /></span>
                  <span className="spec-n">{s.certs} <span className="muted small">{s.people} {s.people === 1 ? 'person' : 'people'}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
