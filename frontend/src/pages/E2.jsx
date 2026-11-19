import { useState } from 'react'
import { samplePayload, dirtyPayload, validate, detect } from '../e2/engine.js'
import ConflictGraph from './ConflictGraph.jsx'
import ConflictReport from './ConflictReport.jsx'
import { e1ToPayload, payloadToE1, scheduleFromResult, generateWithE3 } from '../e2/bridge.js'

const TABS = ['Pipeline', 'Input data', 'Validation report', 'Conflict report', 'Conflict graph', 'Schedule']

export default function E2({ e2, setE2, e1, wf, onGenerated }) {
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('Pipeline')
  const [text, setText] = useState(e2.payload ? JSON.stringify(e2.payload, null, 1) : '')
  const [err, setErr] = useState('')
  const [log, setLog] = useState([])
  const say = (m) => setLog((l) => [...l, m])
  const p = e2.payload
  const issues = p ? validate(p) : []
  const errors = issues.filter((i) => i.sev === 'error')
  const valid = p && errors.length === 0
  const det = p && e2.schedule ? detect(p, e2.schedule) : null
  const clean = det && det.conflicts.length === 0

  const load = (data, label) => { setE2({ payload: data, schedule: null, sent: false }); setText(JSON.stringify(data, null, 1)); setLog([`E1 -> E2: ${label} received`]) }
  const applyText = () => { try { load(JSON.parse(text), 'JSON data'); setErr('') } catch (e) { setErr('Invalid JSON: ' + e.message) } }
  // Real E3: greedy + backtracking scheduler on the server. Its result is re-checked here by E2.
  const assign = async () => {
    setBusy(true)
    say('E2 -> E3: validated data sent to the E3 scheduler (greedy + backtracking)...')
    const result = await generateWithE3(payloadToE1(p))
    setBusy(false)
    if (!result.success) {
      say(`E3 -> E2: no timetable (${result.stage}). ${(result.errors || []).slice(0, 3).join(' | ')}`)
      if (onGenerated) onGenerated(result)
      return
    }
    const schedule = scheduleFromResult(result)
    setE2({ ...e2, schedule, sent: false })
    if (onGenerated) onGenerated(result)
    say(`E3 -> E2: ${schedule.length} sessions assigned in ${(result.summary.timeMs / 1000).toFixed(2)} s; E3's own audit: ${result.summary.auditPassed ? 'passed' : 'FAILED'}`)
  }
  const resolve = () => say('E3 returns only audited, conflict-free timetables. If E2 still reports a conflict here, report it as a defect.')
  const send = () => { setE2({ ...e2, sent: true }); say('E2 -> E4: conflict-free timetable released (see Timetable page)') }

  const steps = [
    ['1. E1 → E2: receive academic data', p ? 'done' : 'now', 'Receives courses, faculty, rooms, divisions, slots and sessions.',
      <><button onClick={() => load(e1ToPayload(e1), 'data from the E1 pages')}>Load data from E1 pages</button> <button className="ghost" onClick={() => load(samplePayload(), 'sample data')}>Load sample data</button> <button className="ghost" onClick={() => load(dirtyPayload(), 'sample data with errors')}>Load sample with errors</button></>],
    ['2. E2: validate data', !p ? '' : valid ? 'done' : 'now', p ? (valid ? 'All checks passed.' : `${errors.length} error(s) found. Fix the data in E1 (see Validation report).`) : 'Checks nulls, duplicates, references, ranges, workload.', null],
    ['3. E2 → E3: send for assignment', !valid ? '' : e2.schedule ? 'done' : 'now', 'The real E3 engine assigns faculty, rooms and time slots.', valid && !e2.schedule && <button onClick={assign} disabled={busy}>{busy ? 'E3 is scheduling…' : 'Send to E3'}</button>],
    ['4. E2: conflict check (conflict graph)', !e2.schedule ? '' : clean ? 'done' : 'now', det ? `${det.edges.length} edges in conflict graph, ${det.conflicts.length} conflict(s) found.` : 'Builds the graph and finds clashing edges.', null],
    ['5. E2 → E3: resolve conflicts', !det ? '' : clean ? 'done' : 'now', 'E3 resolves conflicts during search (backtracking), so this step is normally already complete.', det && !clean && <button onClick={resolve}>Explain</button>],
    ['6. E2 → E4: send final timetable', !clean ? '' : e2.sent ? 'done' : 'now', 'Only a conflict-free timetable is released to E4.', clean && !e2.sent && <button onClick={send}>Send to E4</button>],
  ]

  return (
    <div>
      <h2>E2 · Constraint &amp; Validation Engine</h2>
      <div className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'Conflict report' && wf?.result && !wf.result.success ? <span className="tab-count">{(wf.result.errors || []).length}</span> : null}</button>)}</div>

      {tab === 'Pipeline' && (
        <div className="panel">
          <ol className="pipe">{steps.map(([t, st, d, act]) => (
            <li key={t} className={st}><div><b>{t}</b><div className="muted">{d}</div></div><div>{act}</div></li>))}</ol>
          {wf?.result && !wf.result.success && (
            <div className="cr-alert">
              <span><b>E3 could not build a timetable.</b> {(wf.result.errors || []).length} problem(s) found. See the full conflict report.</span>
              <button className="danger" onClick={() => setTab('Conflict report')}>View conflict report</button>
            </div>
          )}
          {log.length > 0 && <pre className="log">{log.join('\n')}</pre>}
          <p className="muted">E3 is the real scheduling engine on the ClassSync server. E2 re-checks every timetable E3 returns.</p>
        </div>
      )}

      {tab === 'Input data' && (
        <div className="panel">
          <p className="muted">Paste the JSON received from E1 (courses, faculty, rooms, divisions, slots, sessions), or load the sample from Pipeline.</p>
          <textarea className="json" rows="16" value={text} onChange={(e) => setText(e.target.value)} />
          <div><button onClick={applyText}>Receive data</button></div>
          {err && <p className="error">{err}</p>}
        </div>
      )}

      {tab === 'Validation report' && (!p ? <p className="muted">No data received yet.</p> : (
        <div>
          <p><span className={'badge ' + (valid ? 'ok' : 'bad')}>{valid ? 'PASSED' : errors.length + ' ERRORS'}</span></p>
          <table><thead><tr><th>Where</th><th>Issue</th></tr></thead><tbody>
            {issues.length === 0 && <tr><td colSpan="2" className="empty">No nulls, duplicates or invalid references found.</td></tr>}
            {issues.map((i, k) => <tr key={k}><td>{i.where}</td><td>{i.msg}</td></tr>)}</tbody></table>
        </div>))}

      {tab === 'Conflict report' && <ConflictReport wf={wf} issues={issues} det={det} onRun={() => setTab('Pipeline')} />}

      {tab === 'Conflict graph' && (!e2.schedule ? <p className="muted">Run E3 assignment first (Pipeline).</p> : <ConflictGraph sessions={e2.schedule} det={det} payload={p} />)}

      {tab === 'Schedule' && (!e2.schedule ? <p className="muted">No schedule yet.</p> : (
        <table><thead><tr><th>Session</th><th>Course</th><th>Faculty</th><th>Division</th><th>Batch</th><th>Slot</th><th>Room</th></tr></thead><tbody>
          {e2.schedule.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.course}</td><td>{s.faculty}</td><td>{s.division}</td><td>{s.batch || '-'}</td><td>{s.slot}</td><td>{s.room}</td></tr>)}</tbody></table>))}
    </div>
  )
}
