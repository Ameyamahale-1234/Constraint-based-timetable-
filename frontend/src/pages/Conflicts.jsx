// Conflict report for the last E3 run: the reasons a timetable could not be made,
// or the independent audit of a generated timetable.
export default function Conflicts({ wf, go }) {
  const r = wf.result
  if (!r) {
    return (
      <div>
        <h2>Conflict Reports</h2>
        <div className="panel"><p className="muted">No timetable has been generated yet.</p><button onClick={() => go('generate')}>Generate timetable</button></div>
      </div>
    )
  }
  const a = r.audit
  const checks = a ? [
    ['Faculty double-booking', a.conflicts.faculty],
    ['Room double-booking', a.conflicts.room],
    ['Division clashes (theory vs lab)', a.conflicts.division],
    ['Lab batch clashes', a.conflicts.batch],
    ['Time rules (periods, lunch, breaks)', a.ruleViolations.time],
    ['Durations (credits / lab hours)', a.ruleViolations.duration],
    ['Labs outside the lab window', a.ruleViolations.labWindow],
    ['Room too small', a.ruleViolations.roomCapacity],
    ['Teacher hour limits', a.ruleViolations.facultyWorkload],
    ['Missing teacher / room / slot', a.ruleViolations.missingAssignmentsOrResources],
  ] : []
  return (
    <div>
      <h2>Conflict Reports</h2>
      <p className="muted">Last run {wf.generatedAt ? new Date(wf.generatedAt).toLocaleString() : ''} · {r.summary?.placed ?? 0}/{r.summary?.sessions ?? 0} sessions placed</p>
      {r.success ? (
        <>
          <p><span className="badge ok">CONFLICT-FREE</span> The independent audit re-checked every rule after E3 finished.</p>
          <table>
            <thead><tr><th>Check</th><th>Violations</th><th>Status</th></tr></thead>
            <tbody>{checks.map(([name, n]) => (
              <tr key={name}><td>{name}</td><td>{n}</td><td><span className={'badge ' + (n === 0 ? 'ok' : 'bad')}>{n === 0 ? 'Passed' : 'Failed'}</span></td></tr>
            ))}</tbody>
          </table>
        </>
      ) : (
        <>
          <p><span className="badge bad">NOT GENERATED</span> Fix the problems below on the E1 pages, then generate again.</p>
          <table>
            <thead><tr><th>Type</th><th>Details</th><th>Status</th></tr></thead>
            <tbody>
              {wf.conflicts.map((c, i) => (
                <tr key={i}><td>{c.type}</td><td>{c.details}</td><td><span className="badge bad">{c.state}</span></td></tr>
              ))}
            </tbody>
          </table>
          {r.hardestSessions?.length > 0 && (
            <div className="panel" style={{ marginTop: 14 }}>
              <h3>Hardest sessions to place</h3>
              <p className="muted">{r.hardestSessions.map((h) => `${h.courseName} (${h.divisionName}${h.batch && !String(h.batch).includes('(full)') ? ' ' + h.batch : ''})`).join(', ')}</p>
            </div>
          )}
        </>
      )}
      {r.warnings?.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>Notes</h3>
          <ul>{r.warnings.map((w, i) => <li key={i} className="muted">{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
