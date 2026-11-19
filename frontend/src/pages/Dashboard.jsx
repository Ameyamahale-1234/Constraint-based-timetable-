import { LABEL, STEPS, DONE } from '../workflow.js'

export default function Dashboard({ user, counts, go, wf }) {
  const cards = [
    ['Courses', counts.courses, 'entity:courses'],
    ['Faculty', counts.faculty, 'entity:faculty'],
    ['Rooms & Labs', counts.rooms, 'entity:rooms'],
    ['Divisions', counts.divisions, 'entity:divisions'],
    ['Time Slots', counts.slots || 'Default', 'entity:slots'],
    ['Teaching Assignments', counts.assignments, 'entity:assignments'],
  ]
  const done = DONE[wf.status]
  const summary = wf.result?.summary
  return (
    <div>
      <h2>Welcome, {user.name}</h2>
      <p><b>Timetable status:</b> {LABEL[wf.status]}{wf.generatedAt && <span className="muted"> · generated {new Date(wf.generatedAt).toLocaleString()}</span>}</p>
      {user.role === 'coordinator' ? (
        <>
          <div className="cards">
            {cards.map(([t, n, p]) => (
              <button key={t} className="stat" onClick={() => go(p)}>
                <span>{n}</span>{t}
              </button>
            ))}
          </div>
          <div className="panel">
            <h3>Workflow</h3>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i < done ? 'done' : i === done ? 'now' : ''}><span>{i < done ? '✓' : i + 1}</span>{s}</li>
              ))}
            </ol>
            {summary && <p className="muted">Last run: {summary.placed}/{summary.sessions} sessions placed in {(summary.timeMs / 1000).toFixed(2)} s · conflict audit {summary.auditPassed ? 'passed' : 'not passed'}.</p>}
            <p>
              <button onClick={() => go('generate')}>Go to Generate Timetable</button>{' '}
              <button className="ghost" onClick={() => go('e2')}>Open E2 Validation</button>
            </p>
          </div>
        </>
      ) : user.role === 'faculty' ? (
        <div className="panel">
          <p>{wf.status === 'approved' ? 'The timetable is approved. Open Timetable to see your teaching schedule.' : 'Your teaching timetable will appear here once the coordinator approves it.'}</p>
          {wf.status === 'approved' && <button onClick={() => go('timetable')}>Open my timetable</button>}
        </div>
      ) : (
        <div className="panel">
          <p>{wf.status === 'approved' ? 'The timetable is approved. Open Timetable and choose your division.' : 'The timetable for your division will appear here once it is approved.'}</p>
          {wf.status === 'approved' && <button onClick={() => go('timetable')}>Open timetable</button>}
        </div>
      )}
    </div>
  )
}
