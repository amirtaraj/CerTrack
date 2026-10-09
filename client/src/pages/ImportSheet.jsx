import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/ui.jsx';

export default function ImportSheet() {
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(dryRun) {
    setBusy(true); setError('');
    try {
      const { result } = await api.importSheet(file, dryRun);
      setReport(result);
      if (!dryRun) toast(`Imported ${result.certsCreated} certifications`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }
  const pick = (f) => { setFile(f || null); setReport(null); setError(''); };

  return (
    <>
      <header className="page-head"><div><h1>Import spreadsheet</h1>
        <p className="lede">Bring in an Excel file with the columns EMP ID, EMP Name, Specialization, Certification Name, Date Completed and Expiration Date.</p></div></header>

      <section className="panel">
        <h2>1. Choose a file</h2>
        <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
          <p>{file ? <><strong>{file.name}</strong> <span className="muted">({Math.round(file.size / 1024)} KB)</span></> : 'Drop an .xlsx file here, or'}</p>
          <button className="btn" onClick={() => input.current.click()}>{file ? 'Choose a different file' : 'Choose file'}</button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files[0])} />
        </div>
        <p className="muted small">Dates can be real Excel dates or DD/MM/YYYY text. "No expiry" and blank cells are understood. People and certifications already in the tracker are never overwritten, so edits made in the app always win.</p>
        <div className="actions">
          <button className="btn" disabled={!file || busy} onClick={() => run(true)}>{busy && !report ? 'Checking…' : 'Check file first'}</button>
          <button className="btn primary" disabled={!file || busy} onClick={() => run(false)}>Import now</button>
        </div>
      </section>

      {error && <div className="banner err" role="alert">{error}</div>}

      {report && (
        <section className="panel">
          <h2>{report.dryRun ? 'Check results (nothing saved yet)' : 'Import finished'}</h2>
          <p style={{ marginTop: 0 }}>
            {report.rowsRead} rows read. {report.dryRun ? 'Importing would add' : 'Added'} <strong>{report.certsCreated}</strong> certifications
            and <strong>{report.usersCreated}</strong> new {report.usersCreated === 1 ? 'person' : 'people'}.
            {report.certsSkippedExisting > 0 && ` ${report.certsSkippedExisting} were already in the tracker and left as they are.`}
          </p>
          {report.usersCreated > 0 && !report.dryRun && <p className="muted small">New people can sign in with their employee ID and the starting password you've configured. They'll choose their own at first sign-in.</p>}
          {report.issues.length > 0 && (
            <>
              <h3>{report.issues.length} {report.issues.length === 1 ? 'thing' : 'things'} to look at</h3>
              <ul className="issues">
                {report.issues.map((i, n) => <li key={n} className={i.level}>{i.row ? <span className="muted small">Row {i.row}. </span> : null}{i.message}</li>)}
              </ul>
            </>
          )}
          {report.dryRun && <div className="actions"><button className="btn primary" disabled={busy} onClick={() => run(false)}>Looks right, import now</button></div>}
        </section>
      )}
    </>
  );
}
