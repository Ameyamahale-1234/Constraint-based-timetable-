import { useMemo, useState } from "react";
import { CalendarDays, FileDown, Files, Loader2, CheckCircle2 } from "lucide-react";
import TimetableSheet from "../TimetableSheet";
import { DAY_NAMES, defaultAcademicYear, divisionLabel, rowsFor, viewOptions } from "../sheetModel";
import { downloadAllDivisionsPdf, downloadPdf } from "../pdfExport";
import { LABEL } from "../workflow";

function downloadCsv(result) {
  const header = ["Day", "Start", "End", "Semester/Division", "Batch", "Course", "Type", "Teacher(s)", "Room"];
  const divisionById = new Map(result.divisions.map((d) => [String(d.id), d]));
  const lines = result.timetable.map((r) => {
    const d = divisionById.get(String(r.divisionId));
    return [DAY_NAMES[r.day] || r.day, r.start, r.end, d ? divisionLabel(d) : r.divisionName, r.batch, r.courseName, r.courseType, r.facultyNames.join(" & "), r.roomName]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(result.collegeName || "timetable").replace(/[^a-z0-9]+/gi, "_")}_timetable.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Timetable viewer. Coordinator: every view, PDF/CSV export and approval.
 * Faculty: their own teaching timetable. Student: their division. Both only after approval.
 */
export default function TimetablePage({ user, wf, setWf, go }) {
  const result = wf.result;
  const isCoord = user.role === "coordinator";
  const allowedViews = isCoord ? [["division", "By division"], ["faculty", "By teacher"], ["room", "By room"]]
    : user.role === "faculty" ? [["faculty", "My timetable"]] : [["division", "My division"]];
  const [view, setView] = useState(allowedViews[0][0]);
  const [selected, setSelected] = useState("");
  const [department, setDepartment] = useState("");
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [pdfBusy, setPdfBusy] = useState(false);

  const options = useMemo(() => viewOptions(result, view), [result, view]);
  const activeSelection = options.some((o) => o.value === selected) ? selected : options[0]?.value || "";
  const rows = useMemo(() => rowsFor(result, view, activeSelection), [result, view, activeSelection]);
  const meta = { department, academicYear };

  if (!result?.success) {
    return (
      <div className="dev">
        <h2>Timetable</h2>
        <div className="panel"><p>No timetable has been generated yet.</p>{isCoord && <button onClick={() => go("generate")}>Generate timetable</button>}</div>
      </div>
    );
  }
  if (!isCoord && wf.status !== "approved") {
    return (
      <div className="dev">
        <h2>Timetable</h2>
        <div className="panel"><p>The timetable is not available yet. It will appear here once the coordinator approves it.</p></div>
      </div>
    );
  }

  function makePdf(all) {
    setPdfBusy(true);
    setTimeout(() => {
      try {
        if (all) downloadAllDivisionsPdf(result, meta);
        else downloadPdf(result, view, activeSelection, meta, options.find((o) => o.value === activeSelection)?.label);
      } finally {
        setPdfBusy(false);
      }
    }, 30);
  }

  return (
    <div className="generate">
      {isCoord && (
        <div className={`panel status-strip ${wf.status === "approved" ? "ok" : ""}`}>
          <span><b>Status:</b> {LABEL[wf.status]}</span>
          {wf.status === "conflict_free" && <button className="generate-btn" type="button" onClick={() => setWf({ ...wf, status: "approved" })}><CheckCircle2 size={16} /> Approve timetable</button>}
          {wf.status === "approved" && <span className="approved-tag"><CheckCircle2 size={16} /> Visible to faculty and students</span>}
        </div>
      )}
      <div className="panel">
        <div className="view-bar">
          <div className="tabs">
            {allowedViews.map(([key, label]) => (
              <button type="button" key={key} className={view === key ? "active" : ""} onClick={() => { setView(key); setSelected(""); }}>{label}</button>
            ))}
          </div>
          <select value={activeSelection} onChange={(e) => setSelected(e.target.value)}>
            {options.map((o) => <option key={o.value} value={o.value}>{view === "room" ? `Room ${o.label}` : o.label}</option>)}
          </select>
          <div className="export-buttons">
            <button type="button" className="pdf-btn" disabled={pdfBusy} onClick={() => makePdf(false)}>
              {pdfBusy ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />} Download PDF
            </button>
            {isCoord && view === "division" && (
              <button type="button" className="csv-btn" disabled={pdfBusy} onClick={() => makePdf(true)}>
                <Files size={16} /> All divisions (PDF)
              </button>
            )}
            {isCoord && (
              <button type="button" className="csv-btn" onClick={() => downloadCsv(result)}>
                <CalendarDays size={16} /> CSV
              </button>
            )}
          </div>
        </div>
        <div className="sheet-meta">
          <label>
            <span>Department</span>
            <input type="text" value={department} placeholder="e.g. Computer Science and Engineering" onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <label>
            <span>Academic year</span>
            <input type="text" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </label>
        </div>
        <TimetableSheet result={result} rows={rows} view={view} value={activeSelection} meta={meta} />
      </div>
    </div>
  );
}
