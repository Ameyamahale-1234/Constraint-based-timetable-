import { useState } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Play, ShieldCheck } from "lucide-react";
import "./GenerateTimetable.css";
import { ENTITIES } from "./store";
import { generateWithE3, importExcel, readAsBase64 } from "./e2/bridge";
import { fromResult, LABEL } from "./workflow";

/**
 * Generate page: (1) academic data from the E1 pages, optionally imported from Excel,
 * (2) run the real E3 engine, (3) approve the conflict-free result.
 */
export default function GenerateTimetable({ e1, setters, wf, setWf, go }) {
  const [collegeName, setCollegeName] = useState(() => wf.result?.collegeName && wf.result.collegeName !== "College" ? wf.result.collegeName : "");
  const [divisions, setDivisions] = useState(3);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const result = wf.result;
  const counts = Object.fromEntries(Object.keys(ENTITIES).map((k) => [k, e1[k].length]));
  const hasData = counts.courses + counts.faculty + counts.assignments > 0;

  async function handleImport(event) {
    event.preventDefault();
    if (!file) { setImportMsg({ ok: false, text: "Choose an Excel file first." }); return; }
    if (hasData && !window.confirm("Importing replaces the courses, faculty, rooms, divisions and teaching assignments currently on the E1 pages. Continue?")) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await importExcel(await readAsBase64(file), Number(divisions));
      if (!res.data) { setImportMsg({ ok: false, text: (res.errors || ["Import failed."]).join(" ") }); return; }
      const stamp = Date.now();
      for (const key of ["courses", "faculty", "rooms", "divisions", "assignments"]) {
        setters[key](res.data[key].map((row, i) => ({ ...row, id: stamp + i })));
      }
      setWf({ status: "none", conflicts: [], result: null, generatedAt: null });
      setImportMsg({ ok: true, text: `Imported ${res.counts.courses} courses, ${res.counts.faculty} faculty, ${res.counts.rooms} rooms, ${res.counts.divisions} divisions and ${res.counts.assignments} teaching assignments.`, notes: res.notes });
    } finally {
      setImporting(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await generateWithE3(e1, { collegeName });
      setWf(fromResult(res));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="generate">
      <div className="panel upload-panel">
        <div className="upload-header">
          <div>
            <h2>1. Academic data (E1)</h2>
            <p className="muted">The timetable is generated from the data on the E1 pages. Enter it by hand or import an Excel workbook.</p>
          </div>
          <div className="sample-links">
            <a className="sample-link" href="/api/sample"><Download size={16} /> Sample Excel (2 sem × 5 div)</a>
            <a className="sample-link" href="/api/sample-large"><Download size={16} /> Larger template (4 sem × 6 div)</a>
          </div>
        </div>

        <div className="data-summary">
          {Object.entries(ENTITIES).map(([key, entity]) => (
            <button type="button" key={key} className="data-chip" onClick={() => go("entity:" + key)}>
              <strong>{key === "slots" && counts.slots === 0 ? "Default" : counts[key]}</strong>
              <span>{entity.title}</span>
            </button>
          ))}
        </div>

        <form className="form-grid" onSubmit={handleImport}>
          <label className="file-field">
            <span>Import from Excel (.xlsx)</span>
            <div className={`dropzone ${file ? "has-file" : ""}`}>
              <FileSpreadsheet size={20} />
              <span>{file ? file.name : "Choose a file…"}</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </label>
          <label>
            <span>Divisions per semester to import</span>
            <input type="number" min="1" max="26" value={divisions} onChange={(e) => setDivisions(e.target.value)} required />
          </label>
          <label>
            <span>&nbsp;</span>
            <button className="secondary-btn" type="submit" disabled={importing}>
              {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {importing ? "Importing…" : "Import into E1"}
            </button>
          </label>
        </form>
        {importMsg && (
          <div className={`import-msg ${importMsg.ok ? "ok" : "fail"}`}>
            {importMsg.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {importMsg.text}
            {importMsg.notes?.length > 0 && <ul>{importMsg.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="section-title">2. Generate with E3</h2>
        <p className="muted">E3 assigns a teacher, room and time to every class (greedy placement, backtracking when stuck), then an independent audit re-checks every rule.</p>
        <div className="form-grid">
          <label>
            <span>College name</span>
            <input type="text" placeholder="e.g. KLE Technological University" value={collegeName} onChange={(e) => setCollegeName(e.target.value)} />
          </label>
        </div>
        <div className="button-row">
          <button className="generate-btn" type="button" disabled={loading || !hasData} onClick={handleGenerate}>
            {loading ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
            {loading ? "Generating…" : "Generate Timetable"}
          </button>
          <button className="secondary-btn" type="button" onClick={() => go("e2")}><ShieldCheck size={16} /> Validate first in E2</button>
        </div>
        {!hasData && <p className="muted">Add or import academic data first.</p>}
      </div>

      {result && (
        <div className={`panel result-banner ${result.success ? "ok" : "fail"}`}>
          <div className="banner-title">
            {result.success ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            <h2>{result.success ? `Timetable generated${result.collegeName && result.collegeName !== "College" ? ` for ${result.collegeName}` : ""}` : "No timetable could be generated"}</h2>
          </div>
          <p className="muted">Status: {LABEL[wf.status]}</p>
          {result.success && result.summary && (
            <div className="stats">
              {[
                ["Sessions placed", `${result.summary.placed}/${result.summary.sessions}`],
                ["Divisions", result.divisions.length],
                ["Teachers", result.summary.faculty],
                ["Rooms", result.summary.rooms],
                ["Time taken", `${(result.summary.timeMs / 1000).toFixed(2)} s`],
                ["Conflict check", result.summary.auditPassed ? "Passed" : "Failed"]
              ].map(([title, value]) => (
                <div className="stat-card" key={title}><span>{title}</span><h2>{value}</h2></div>
              ))}
            </div>
          )}
          {!result.success && (
            <ul className="error-list">
              {(result.errors || []).slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {(result.errors || []).length > 10 && <li>…and {result.errors.length - 10} more on Conflict Reports.</li>}
            </ul>
          )}
          {result.warnings?.length > 0 && (
            <details className="warnings">
              <summary><AlertTriangle size={15} /> {result.warnings.length} note(s)</summary>
              <ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
          <div className="button-row">
            {result.success && <button className="secondary-btn" type="button" onClick={() => go("timetable")}>View timetable</button>}
            {wf.status === "conflict_free" && <button className="generate-btn" type="button" onClick={() => setWf({ ...wf, status: "approved" })}><CheckCircle2 size={16} /> Approve timetable</button>}
            {wf.status === "approved" && <span className="approved-tag"><CheckCircle2 size={16} /> Approved — faculty and students can view it</span>}
            <button className="secondary-btn" type="button" onClick={() => go("conflicts")}>Conflict report</button>
          </div>
        </div>
      )}
    </div>
  );
}
