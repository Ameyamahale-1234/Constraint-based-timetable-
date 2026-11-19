import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react'

const DAY_ORDER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const DAY_NAME = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const EDGE_FACULTY = '#e07b39'
const EDGE_DIVISION = '#3b6fb6'
const UNCOLOURED = '#d5dbe3'

const slotKey = (slot) => {
  const [day, time] = String(slot || '').split(' ')
  return (DAY_ORDER[day] || 9) * 10000 + Number(String(time || '').slice(0, 5).replace(':', '') || 0)
}
// Distinct colours for any number of slots (golden-angle hues, alternating lightness).
const colourOf = (i) => `hsl(${Math.round((i * 137.508) % 360)}, ${i % 2 ? 62 : 72}%, ${i % 3 === 0 ? 46 : i % 3 === 1 ? 56 : 40}%)`

/**
 * Conflict graph of the timetable as a graph-colouring problem.
 * Vertex = class session, edge = two sessions that may not share a time slot, colour = time slot.
 */
export default function ConflictGraph({ sessions, det, payload }) {
  const [scope, setScope] = useState('all')
  const [layout, setLayout] = useState('columns')
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)
  const [step, setStep] = useState(null) // null = fully coloured
  const [playing, setPlaying] = useState(false)

  const slots = useMemo(() => [...new Set(sessions.map((s) => s.slot).filter(Boolean))].sort((a, b) => slotKey(a) - slotKey(b)), [sessions])
  const slotIndex = useMemo(() => new Map(slots.map((s, i) => [s, i])), [slots])
  const divisions = useMemo(() => [...new Set(sessions.map((s) => s.division))].sort(), [sessions])
  const teachers = useMemo(() => [...new Set(sessions.map((s) => s.faculty))].sort(), [sessions])
  const courseName = useMemo(() => new Map((payload?.courses || []).map((c) => [String(c.code), c.name])), [payload])

  // Adjacency over the full graph (edge indices refer to positions in `sessions`).
  const adj = useMemo(() => {
    const a = sessions.map(() => new Map())
    det.edges.forEach((e) => { a[e.a].set(e.b, e.why); a[e.b].set(e.a, e.why) })
    return a
  }, [sessions, det])

  const visible = useMemo(() => sessions.map((s, i) => i).filter((i) => {
    if (scope === 'all') return true
    const [kind, value] = scope.split('|')
    return kind === 'div' ? sessions[i].division === value : sessions[i].faculty === value
  }), [sessions, scope])
  const visibleSet = useMemo(() => new Set(visible), [visible])
  const edges = useMemo(() => det.edges.filter((e) => visibleSet.has(e.a) && visibleSet.has(e.b)), [det, visibleSet])

  // Replay order: Welsh–Powell style (highest degree first).
  const order = useMemo(() => [...visible].sort((x, y) => adj[y].size - adj[x].size || slotKey(sessions[x].slot) - slotKey(sessions[y].slot)), [visible, adj, sessions])
  const rank = useMemo(() => new Map(order.map((v, i) => [v, i])), [order])
  const shown = step == null ? visible.length : step
  const isColoured = (i) => step == null || rank.get(i) < shown

  useEffect(() => { setStep(null); setPlaying(false); setPinned(null) }, [scope])
  useEffect(() => {
    if (!playing) return
    if (step != null && step >= visible.length) { setPlaying(false); return }
    const t = setTimeout(() => setStep((s) => (s == null ? 1 : s + 1)), Math.max(40, 2400 / Math.max(visible.length, 1)))
    return () => clearTimeout(t)
  }, [playing, step, visible.length])

  // ---- layout ----
  const big = visible.length > 40
  const R = big ? 11 : 16
  let pos = new Map(), width, height, columns = []
  if (layout === 'columns') {
    const usedSlots = slots.filter((s) => visible.some((i) => sessions[i].slot === s))
    const colW = big ? 32 : 46, rowH = big ? 27 : 40, top = 80, left = 18
    const perCol = usedSlots.map((s) => visible.filter((i) => sessions[i].slot === s))
    const rows = Math.max(1, ...perCol.map((c) => c.length))
    let x = left, lastDay = null
    usedSlots.forEach((s, ci) => {
      const day = s.split(' ')[0]
      if (lastDay && day !== lastDay) x += big ? 14 : 20
      columns.push({ slot: s, day, x: x + colW / 2, newDay: day !== lastDay })
      perCol[ci].forEach((v, ri) => pos.set(v, [x + colW / 2, top + rowH / 2 + ri * rowH]))
      lastDay = day
      x += colW
    })
    width = Math.max(x + left, 420)
    height = top + rows * rowH + 16
  } else {
    const n = visible.length
    const sorted = [...visible].sort((a, b) => slotKey(sessions[a].slot) - slotKey(sessions[b].slot))
    const ring = Math.max(150, (n * (R * 2 + 6)) / (2 * Math.PI))
    width = height = 2 * ring + 4 * R + 40
    sorted.forEach((v, k) => pos.set(v, [width / 2 + ring * Math.cos((2 * Math.PI * k) / n - Math.PI / 2), height / 2 + ring * Math.sin((2 * Math.PI * k) / n - Math.PI / 2)]))
  }

  const focus = pinned ?? hover
  const focusNbrs = focus != null ? adj[focus] : null
  const bad = new Set(det.conflicts.filter((c) => c.edge).map((c) => c.edge.a + '-' + c.edge.b))
  const visibleConflicts = edges.filter((e) => bad.has(e.a + '-' + e.b)).length
  const maxDeg = Math.max(0, ...visible.map((i) => [...adj[i].keys()].filter((j) => visibleSet.has(j)).length))
  const label = (s) => String(s.course).slice(0, 4) + (s.batch ? '·' + String(s.batch).slice(-2) : '')
  const current = step != null && step > 0 ? order[step - 1] : null
  const info = focus != null ? focus : current

  const curve = (a, b) => {
    const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b)
    if (layout !== 'columns') return `M${x1},${y1} L${x2},${y2}`
    const lift = Math.min(60, Math.abs(x2 - x1) * 0.25)
    return `M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - lift} ${x2},${y2}`
  }

  return (
    <div className="cg">
      <div className="cg-toolbar">
        <label>Show
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Whole timetable ({sessions.length} sessions)</option>
            <optgroup label="One division">{divisions.map((d) => <option key={d} value={'div|' + d}>Division {d}</option>)}</optgroup>
            <optgroup label="One teacher">{teachers.map((t) => <option key={t} value={'fac|' + t}>{t}</option>)}</optgroup>
          </select>
        </label>
        <div className="cg-seg">
          <button className={layout === 'columns' ? 'on' : ''} onClick={() => setLayout('columns')}>Colour classes</button>
          <button className={layout === 'circle' ? 'on' : ''} onClick={() => setLayout('circle')}>Circle</button>
        </div>
        <div className="cg-replay">
          <button onClick={() => { if (step == null || step >= visible.length) setStep(0); setPlaying(!playing) }} title="Replay the colouring">
            {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Replay colouring'}
          </button>
          <button className="ghost" onClick={() => { setPlaying(false); setStep((s) => Math.min(visible.length, (s ?? visible.length) >= visible.length ? 1 : s + 1)) }} title="Next step"><SkipForward size={15} /></button>
          <button className="ghost" onClick={() => { setPlaying(false); setStep(null) }} title="Show the final colouring"><RotateCcw size={15} /></button>
          <input type="range" min="0" max={visible.length} value={shown} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)) }} />
          <span className="muted">{shown}/{visible.length} coloured</span>
        </div>
      </div>

      <div className="cg-stats">
        <div><span>{visible.length}</span>vertices (sessions)</div>
        <div><span>{edges.length}</span>edges (must differ)</div>
        <div><span>{maxDeg}</span>max degree</div>
        <div><span>{new Set(visible.map((i) => sessions[i].slot)).size}</span>colours (time slots)</div>
        <div className={visibleConflicts ? 'bad' : 'good'}><span>{visibleConflicts}</span>conflicting edges</div>
      </div>

      <div className="cg-canvas">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} onClick={() => setPinned(null)}>
          {layout === 'columns' && columns.map((c) => (
            <g key={c.slot}>
              {c.newDay && <text x={c.x - (big ? 15 : 23) + 2} y={18} className="cg-day">{DAY_NAME[c.day] || c.day}</text>}
              <rect x={c.x - (big ? 13 : 20)} y={30} width={big ? 26 : 40} height={height - 40} rx="6" fill={colourOf(slotIndex.get(c.slot))} opacity={0.08} />
              <rect x={c.x - (big ? 13 : 20)} y={30} width={big ? 26 : 40} height="7" rx="3" fill={colourOf(slotIndex.get(c.slot))} />
              <text x={c.x} y={49} textAnchor="middle" className="cg-time">{c.slot.split(' ')[1]?.slice(0, 5)}</text>
              <text x={c.x} y={60} textAnchor="middle" className="cg-time end">–{c.slot.split('-')[1]?.slice(0, 5)}</text>
            </g>
          ))}
          <g>
            {edges.map((e) => {
              const isBad = bad.has(e.a + '-' + e.b)
              const touches = focus != null && (e.a === focus || e.b === focus)
              const hidden = step != null && !(isColoured(e.a) && isColoured(e.b))
              const base = big ? 0.07 : 0.22
              return (
                <path key={e.a + '-' + e.b} d={curve(e.a, e.b)} fill="none"
                  stroke={isBad ? '#e8453c' : e.why.startsWith('faculty') ? EDGE_FACULTY : EDGE_DIVISION}
                  strokeWidth={isBad ? 3 : touches ? 2 : 1}
                  opacity={isBad ? 1 : focus != null ? (touches ? 0.9 : 0.03) : hidden ? 0.03 : base} />
              )
            })}
          </g>
          {visible.map((i) => {
            const s = sessions[i], [x, y] = pos.get(i)
            const coloured = isColoured(i)
            const dim = focus != null && i !== focus && !focusNbrs.has(i)
            const isCurrent = i === current
            return (
              <g key={s.id} className="cg-node" opacity={dim ? 0.18 : 1}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onClick={(ev) => { ev.stopPropagation(); setPinned(pinned === i ? null : i) }}>
                {(isCurrent || i === focus) && <circle cx={x} cy={y} r={R + 5} fill="none" stroke="#111827" strokeWidth="2.5" />}
                <circle cx={x} cy={y} r={R} fill={coloured && s.slot ? colourOf(slotIndex.get(s.slot)) : UNCOLOURED} stroke="#fff" strokeWidth="2" />
                <text x={x} y={y + (big ? 3 : 4)} textAnchor="middle" fontSize={big ? 7.5 : 10} fontWeight="700" fill={coloured ? '#fff' : '#5b6675'}>{label(s)}</text>
                <title>{`${s.id}: ${courseName.get(String(s.course)) || s.course} · ${s.division}${s.batch ? ' ' + s.batch : ''} · ${s.faculty} · ${s.slot}`}</title>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="cg-bottom">
        <div className="cg-info panel">
          {info == null ? (
            <>
              <h3>How to read this graph</h3>
              <ul>
                <li><b>Vertex</b> = one class session. <b>Colour</b> = the time slot it got.</li>
                <li><b style={{ color: EDGE_DIVISION }}>Blue edge</b> = same division/batch, <b style={{ color: EDGE_FACULTY }}>orange edge</b> = same teacher. Joined sessions must get different colours.</li>
                <li><b>Colour classes</b> puts every slot in its own column. No edge stays inside a column, which proves the colouring is proper.</li>
                <li>Hover or click a vertex to highlight its neighbours. <b>Replay colouring</b> colours vertices one by one, highest degree first.</li>
              </ul>
            </>
          ) : (() => {
            const s = sessions[info]
            const nbrs = [...adj[info].keys()]
            const sameColour = nbrs.filter((j) => sessions[j].slot === s.slot).length
            const fac = nbrs.filter((j) => adj[info].get(j).includes('faculty')).length
            return (
              <>
                <h3><span className="cg-dot" style={{ background: colourOf(slotIndex.get(s.slot)) }} />{courseName.get(String(s.course)) || s.course} <small className="muted">({s.id})</small></h3>
                <dl>
                  <dt>Division</dt><dd>{s.division}{s.batch ? ` · batch ${s.batch}` : ''}</dd>
                  <dt>Teacher</dt><dd>{s.faculty}</dd>
                  <dt>Colour (slot)</dt><dd>{s.slot}</dd>
                  <dt>Room</dt><dd>{s.room}</dd>
                  <dt>Degree</dt><dd>{nbrs.length} neighbours ({nbrs.length - fac} division/batch, {fac} teacher)</dd>
                  <dt>Check</dt><dd className={sameColour ? 'bad' : 'good'}>{sameColour ? `${sameColour} neighbour(s) share this colour` : 'No neighbour has the same colour ✓'}</dd>
                </dl>
                {step != null && info === current && <p className="muted">Step {step}: this vertex gets colour “{s.slot}”, which none of its already-coloured neighbours use.</p>}
              </>
            )
          })()}
        </div>
        <div className="cg-conflicts">
          <table><thead><tr><th>Conflict</th><th>Details</th></tr></thead><tbody>
            {det.conflicts.length === 0 && <tr><td colSpan="2" className="empty">Conflict-free: no edge joins two vertices of the same colour.</td></tr>}
            {det.conflicts.map((c, i) => <tr key={i}><td>{c.type}</td><td>{c.details}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  )
}
