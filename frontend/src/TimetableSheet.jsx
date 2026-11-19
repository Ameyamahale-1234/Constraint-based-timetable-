import { DAY_NAMES, buildSheet, entryLines, headerFields } from "./sheetModel";

/** Printable class-timetable sheet for one division, teacher or room. */
export default function TimetableSheet({ result, rows, view, value, meta }) {
  const sheet = buildSheet(result, rows);
  const fields = headerFields(result, view, value, meta);

  return (
    <div className="sheet">
      <div className="sheet-title">
        <h2>Class Timetable</h2>
        {result.collegeName && <p>{result.collegeName}</p>}
      </div>

      <div className="sheet-fields">
        {fields.map(([label, text]) => (
          <div key={label}>
            <span>{label}:</span>
            <strong>{text}</strong>
          </div>
        ))}
      </div>

      <div className="grid-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-time">Time</th>
              {sheet.days.map(d => <th key={d}>{DAY_NAMES[d] || d}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map(r => r.type === "lunch" ? (
              <tr key="lunch" className="lunch-row">
                <td className="sheet-time">{r.start} – {r.end}</td>
                <td colSpan={sheet.days.length}>Lunch Break</td>
              </tr>
            ) : (
              <tr key={r.start}>
                <td className="sheet-time">{r.start} – {r.end}</td>
                {r.cells.map(cell => (
                  <td key={cell.day} className={!cell.open && !cell.entries.length ? "closed" : ""}>
                    {!cell.open && !cell.entries.length && <span className="closed-mark">—</span>}
                    {cell.entries.map(({ row, continued }) => (
                      <div key={row.sessionId} className={`slot ${row.courseType === "LAB" ? "lab" : row.courseType === "PROJECT" ? "project" : "theory"} ${continued ? "continued" : ""}`}>
                        {continued ? (
                          <span className="contd">↳ {row.courseType === "LAB" ? `${row.courseName} (${row.batch})` : row.courseName} contd.</span>
                        ) : (
                          entryLines(row, view, result).map((line, i) => i === 0 ? <strong key={i}>{line}</strong> : <small key={i}>{line}</small>)
                        )}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet-legend">
        <span><i className="theory" /> Theory</span>
        <span><i className="lab" /> Lab (batch in brackets)</span>
        <span><i className="closed" /> Outside college hours</span>
      </div>
    </div>
  );
}
