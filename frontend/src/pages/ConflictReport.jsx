import { AlertTriangle, CheckCircle2, XCircle, Users, Building2, GraduationCap, UserX, CalendarX, FileWarning, Clock } from 'lucide-react'
import { stageLabel } from '../workflow.js'

// Groups E3's messages into problem types a coordinator can act on.
const CATEGORIES = [
  { key: 'teacher', title: 'Teacher overloaded', icon: Users, test: /only teacher|teacher-hours|can teach at most|teachers \[/i, fix: 'Give some of these classes to another teacher on the Teaching Assignments page, or reduce the hours.' },
  { key: 'missing', title: 'No teacher assigned', icon: UserX, test: /no teacher|not mapped|no faculty/i, fix: 'Assign a teacher for this course and division on the Teaching Assignments page.' },
  { key: 'room', title: 'Not enough rooms / labs', icon: Building2, test: /room|lab window/i, fix: 'Add rooms of this type on Rooms & Labs, or reduce the number of lab sessions.' },
  { key: 'division', title: 'Division has too many hours', icon: GraduationCap, test: /h\/week of usable time|of division .* has|^division .* has/i, fix: 'Remove courses or credits for this division, or add periods on Time Slots.' },
  { key: 'days', title: 'Not enough days', icon: CalendarX, test: /different days|day\(s\)/i, fix: 'Reduce the credits of this course or add working days.' },
  { key: 'data', title: 'Invalid data', icon: FileWarning, test: /invalid|missing|duplicate|unknown|must be/i, fix: 'Correct the highlighted rows on the E1 pages.' },
  { key: 'time', title: 'Search stopped', icon: Clock, test: /time limit|no solution|could not/i, fix: 'The data is very tight. Add a room, a teacher or a period, then try again.' },
]
const categorise = (msg) => CATEGORIES.find((c) => c.test.test(msg)) || { key: 'other', title: 'Other problem', icon: AlertTriangle, fix: '' }

/** E2's view of the last E3 run: why it failed, or proof that the result is conflict-free. */
export default function ConflictReport({ wf, issues, det, onRun }) {
  const r = wf?.result
  const errors = issues.filter((i) => i.sev === 'error')

  if (!r) {
    return (
      <div className="cr">
        <div className="cr-hero idle">
          <AlertTriangle size={28} />
          <div><h3>No E3 run yet</h3><p>Validate the data on the Pipeline tab and click <b>Send to E3</b>. Problems found by E3 will be listed here.</p></div>
          {onRun && <button onClick={onRun}>Go to Pipeline</button>}
        </div>
        {errors.length > 0 && <ValidationBlock errors={errors} />}
      </div>
    )
  }

  const when = wf.generatedAt ? new Date(wf.generatedAt).toLocaleString() : ''
  if (!r.success) {
    const groups = new Map()
    for (const msg of [...new Set(r.errors || [])]) {
      const c = categorise(msg)
      if (!groups.has(c.key)) groups.set(c.key, { ...c, items: [] })
      groups.get(c.key).items.push(msg)
    }
    return (
      <div className="cr">
        <div className="cr-hero bad">
          <XCircle size={30} />
          <div>
            <h3>E3 could not build a timetable</h3>
            <p>Reason: <b>{stageLabel(r.stage)}</b> · {groups.size} problem type(s), {(r.errors || []).length} message(s) · {when}</p>
          </div>
        </div>
        <div className="cr-summary">
          {[...groups.values()].map((g) => { const Icon = g.icon; return (
            <a key={g.key} href={'#cr-' + g.key} className="cr-chip"><Icon size={16} /> {g.title} <b>{g.items.length}</b></a>
          ) })}
        </div>
        {[...groups.values()].map((g) => { const Icon = g.icon; return (
          <div className="cr-group" id={'cr-' + g.key} key={g.key}>
            <div className="cr-group-head"><Icon size={20} /><h4>{g.title}</h4><span className="badge bad">{g.items.length}</span></div>
            {g.fix && <p className="cr-fix"><b>How to fix:</b> {g.fix}</p>}
            <ol>{g.items.map((m, i) => <li key={i}>{m}</li>)}</ol>
          </div>
        ) })}
        {r.hardestSessions?.length > 0 && (
          <div className="cr-group">
            <div className="cr-group-head"><AlertTriangle size={20} /><h4>Hardest sessions to place</h4></div>
            <p className="muted">{r.hardestSessions.map((h) => `${h.courseName} (${h.divisionName}${h.batch && !String(h.batch).includes('(full)') ? ' ' + h.batch : ''})`).join(', ')}</p>
          </div>
        )}
        {errors.length > 0 && <ValidationBlock errors={errors} />}
      </div>
    )
  }

  const a = r.audit
  const checks = a ? [
    ['Faculty double-booking', a.conflicts.faculty], ['Room double-booking', a.conflicts.room],
    ['Division clashes', a.conflicts.division], ['Lab batch clashes', a.conflicts.batch],
    ['Time rules (periods, lunch, breaks)', a.ruleViolations.time], ['Durations', a.ruleViolations.duration],
    ['Labs outside the lab window', a.ruleViolations.labWindow], ['Room too small', a.ruleViolations.roomCapacity],
    ['Teacher hour limits', a.ruleViolations.facultyWorkload], ['Missing teacher / room / slot', a.ruleViolations.missingAssignmentsOrResources],
  ] : []
  const e2Conflicts = det?.conflicts || []
  const clean = e2Conflicts.length === 0 && checks.every(([, n]) => n === 0)
  return (
    <div className="cr">
      <div className={'cr-hero ' + (clean ? 'good' : 'bad')}>
        {clean ? <CheckCircle2 size={30} /> : <XCircle size={30} />}
        <div>
          <h3>{clean ? 'No conflicts' : 'Conflicts found'}</h3>
          <p>{r.summary?.placed}/{r.summary?.sessions} sessions placed · E3 audit {r.summary?.auditPassed ? 'passed' : 'failed'} · E2 graph check {det ? `${e2Conflicts.length} conflict(s)` : 'not run (Send to E3 from this page)'} · {when}</p>
        </div>
      </div>
      <div className="cr-group">
        <div className="cr-group-head"><GraduationCap size={20} /><h4>E2 conflict-graph check</h4></div>
        <table><thead><tr><th>Conflict</th><th>Details</th></tr></thead><tbody>
          {!det && <tr><td colSpan="2" className="empty">Run Send to E3 on the Pipeline tab to re-check this timetable in E2.</td></tr>}
          {det && e2Conflicts.length === 0 && <tr><td colSpan="2" className="empty">No two connected sessions share a time slot or room.</td></tr>}
          {e2Conflicts.map((c, i) => <tr key={i}><td>{c.type}</td><td>{c.details}</td></tr>)}</tbody></table>
      </div>
      {checks.length > 0 && (
        <div className="cr-group">
          <div className="cr-group-head"><CheckCircle2 size={20} /><h4>E3 independent audit</h4></div>
          <table><thead><tr><th>Check</th><th>Violations</th><th>Status</th></tr></thead><tbody>
            {checks.map(([name, n]) => <tr key={name}><td>{name}</td><td>{n}</td><td><span className={'badge ' + (n === 0 ? 'ok' : 'bad')}>{n === 0 ? 'Passed' : 'Failed'}</span></td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

function ValidationBlock({ errors }) {
  return (
    <div className="cr-group">
      <div className="cr-group-head"><FileWarning size={20} /><h4>E2 validation errors</h4><span className="badge bad">{errors.length}</span></div>
      <ol>{errors.map((e, i) => <li key={i}><b>{e.where}:</b> {e.msg}</li>)}</ol>
    </div>
  )
}
