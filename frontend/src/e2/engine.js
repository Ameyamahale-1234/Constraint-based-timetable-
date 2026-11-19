// ===== E2: Constraint & Validation engine (pure functions) =====
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const TIMES = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['13:30', '14:30']]

export function samplePayload() {
  const t = (code, name, type, hours) => ({ code, name, type, hours })
  const s = (id, course, faculty, division, batch = null) => ({ id, course, faculty, division, batch, slot: null, room: null })
  return {
    courses: [t('MCES', 'Microcontrollers & Embedded Systems', 'Theory', 3), t('CNS', 'Cryptography & Network Security', 'Theory', 3),
      t('DL', 'Deep Learning', 'Theory', 3), t('WMN', 'Wireless & Mobile Networks', 'Theory', 2), t('DLL', 'DL Lab', 'Lab', 2)],
    faculty: ['ASN', 'UH', 'SVG', 'PPH', 'MSY'].map((name) => ({ name, dept: 'CSE', maxHours: 12 })),
    rooms: [{ name: 'CLH308', type: 'Classroom', capacity: 70 }, { name: 'CLH210', type: 'Classroom', capacity: 70 },
      { name: 'CLAB1', type: 'Lab', capacity: 35 }, { name: 'CLAB2', type: 'Lab', capacity: 35 }],
    divisions: [{ name: 'A', batches: 'A1,A2', strength: 60 }, { name: 'B', batches: 'B1,B2', strength: 60 }],
    slots: DAYS.flatMap((day) => TIMES.map(([start, end]) => ({ day, start, end }))),
    sessions: [s('S1', 'MCES', 'ASN', 'A'), s('S2', 'MCES', 'ASN', 'A'), s('S3', 'CNS', 'UH', 'A'), s('S4', 'CNS', 'UH', 'A'),
      s('S5', 'DL', 'SVG', 'A'), s('S6', 'DL', 'SVG', 'A'), s('S7', 'WMN', 'PPH', 'A'), s('S8', 'DLL', 'SVG', 'A', 'A1'),
      s('S9', 'DLL', 'MSY', 'A', 'A2'), s('S10', 'MCES', 'ASN', 'B'), s('S11', 'CNS', 'UH', 'B'), s('S12', 'DL', 'SVG', 'B'),
      s('S13', 'WMN', 'PPH', 'B'), s('S14', 'DLL', 'SVG', 'B', 'B1')],
  }
}

// Same data with typical mistakes, to demonstrate validation.
export function dirtyPayload() {
  const p = samplePayload()
  p.courses.push({ code: 'MCES', name: 'Duplicate course', type: 'Theory', hours: 3 })
  p.faculty[1].dept = ''
  p.sessions[2].faculty = 'XYZ'
  p.rooms[1].capacity = 0
  p.slots[1] = { day: 'Mon', start: '10:00', end: '09:30' }
  return p
}

export const slotId = (s) => `${s.day} ${s.start}-${s.end}`
const blank = (v) => v === null || v === undefined || String(v).trim() === ''

// ---------- Stage 1: data validation (nulls, duplicates, references, ranges) ----------
export function validate(p) {
  const issues = []
  const add = (sev, where, msg) => issues.push({ sev, where, msg })
  // Required fields (department, max hours, capacity and strength are optional in E1).
  const req = { courses: ['code', 'name', 'type', 'hours'], faculty: ['name'], rooms: ['name', 'type'],
    divisions: ['name', 'batches'], slots: ['day', 'start', 'end'], sessions: ['id', 'course', 'faculty', 'division'] }
  const key = { courses: (r) => r.code, faculty: (r) => r.name, rooms: (r) => r.name, divisions: (r) => r.name,
    slots: (r) => r.day + r.start, sessions: (r) => r.id }
  for (const ent of Object.keys(req)) {
    const rows = p[ent] || []
    if (!rows.length) add('error', ent, 'No records received')
    const seen = new Set()
    rows.forEach((r, i) => {
      const w = `${ent} #${i + 1}`
      req[ent].forEach((f) => blank(r[f]) && add('error', w, `Missing value: ${f}`))
      const k = key[ent](r)
      if (!blank(k)) { if (seen.has(k)) add('error', w, `Duplicate record: ${k}`); seen.add(k) }
    })
  }
  const num = (rows, ent, f) => rows.forEach((r, i) => !blank(r[f]) && !(Number(r[f]) > 0) && add('error', `${ent} #${i + 1}`, `${f} must be a positive number`))
  num(p.courses || [], 'courses', 'hours'); num(p.faculty || [], 'faculty', 'maxHours')
  num(p.rooms || [], 'rooms', 'capacity'); num(p.divisions || [], 'divisions', 'strength')
  ;(p.slots || []).forEach((s, i) => s.start && s.end && s.end <= s.start && add('error', `slots #${i + 1}`, `End time ${s.end} is not after start ${s.start}`))
  const has = (rows, k, v) => (rows || []).some((r) => String(r[k]) === String(v))
  ;(p.sessions || []).forEach((s) => {
    const w = `session ${s.id}`
    if (blank(s.faculty)) add('error', w, `No teacher assigned (course ${s.course}, division ${s.division})`)
    if (!blank(s.course) && !has(p.courses, 'code', s.course)) add('error', w, `Unknown course: ${s.course}`)
    if (!blank(s.faculty) && !has(p.faculty, 'name', s.faculty)) add('error', w, `Unknown faculty: ${s.faculty}`)
    const d = (p.divisions || []).find((x) => x.name === s.division)
    if (!blank(s.division) && !d) add('error', w, `Unknown division: ${s.division}`)
    if (d && s.batch && !String(d.batches).split(',').map((b) => b.trim()).includes(s.batch)) add('error', w, `Batch ${s.batch} not in division ${s.division}`)
  })
  ;(p.faculty || []).forEach((f) => {
    const n = (p.sessions || []).filter((s) => s.faculty === f.name).length
    if (Number(f.maxHours) > 0 && n > Number(f.maxHours)) add('error', `faculty ${f.name}`, `Workload ${n} exceeds max ${f.maxHours}`)
  })
  return issues
}

// ---------- Stage 2: conflict graph (sessions = vertices, edge = cannot share a slot) ----------
const batchOverlap = (a, b) => !a.batch || !b.batch || a.batch === b.batch
export function buildGraph(sessions) {
  const edges = []
  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
    const a = sessions[i], b = sessions[j], why = []
    if (a.faculty === b.faculty) why.push('faculty')
    if (a.division === b.division && batchOverlap(a, b)) why.push('division/batch')
    if (why.length) edges.push({ a: i, b: j, why: why.join(' + ') })
  }
  return edges
}

export function detect(p, sessions) {
  const edges = buildGraph(sessions)
  const conflicts = []
  edges.forEach((e) => {
    const a = sessions[e.a], b = sessions[e.b]
    if (a.slot && a.slot === b.slot) conflicts.push({ type: 'Clash (' + e.why + ')', details: `${a.id} and ${b.id} at ${a.slot}`, ids: [a.id, b.id], edge: e })
  })
  sessions.forEach((a, i) => sessions.slice(i + 1).forEach((b) => {
    if (a.slot && a.slot === b.slot && a.room && a.room === b.room) conflicts.push({ type: 'Room clash', details: `${a.id} and ${b.id} in ${a.room} at ${a.slot}`, ids: [a.id, b.id] })
  }))
  sessions.forEach((s) => {
    const c = p.courses.find((x) => String(x.code) === String(s.course)), r = p.rooms.find((x) => x.name === s.room), d = p.divisions.find((x) => x.name === s.division)
    if (!s.slot || !s.room) return conflicts.push({ type: 'Unassigned', details: `${s.id} has no ${!s.slot ? 'slot' : 'room'}`, ids: [s.id] })
    const need = s.batch ? Number(d.strength) / String(d.batches).split(',').length : Number(d.strength)
    if (c.type === 'Lab' && r.type !== 'Lab') conflicts.push({ type: 'Room type', details: `${s.id} (lab) is in classroom ${r.name}`, ids: [s.id] })
    if (c.type === 'Theory' && r.type === 'Lab') conflicts.push({ type: 'Room type', details: `${s.id} (theory) is in lab ${r.name}`, ids: [s.id] })
    if (Number(r.capacity) < need) conflicts.push({ type: 'Capacity', details: `${s.id}: ${r.name} holds ${r.capacity}, needs ${need}`, ids: [s.id] })
  })
  return { edges, conflicts }
}

// ---------- E3 STUBS (only to test the E2 loop; the real E3 is a separate engine) ----------
export function stubAssign(p) {
  const slots = p.slots.map(slotId)
  return p.sessions.map((s, i) => {
    const lab = p.courses.find((c) => c.code === s.course).type === 'Lab'
    const room = p.rooms.find((r) => (r.type === 'Lab') === lab)
    return { ...s, slot: slots[Math.floor(i / 2)], room: room.name } // naive: pairs share a slot -> conflicts
  })
}

// Graph colouring (slots = colours) with backtracking, highest-degree vertex first.
export function stubResolve(p, sessions, limit = 50000) {
  const slots = p.slots.map(slotId), edges = buildGraph(sessions), n = sessions.length
  const adj = sessions.map(() => []); edges.forEach((e) => { adj[e.a].push(e.b); adj[e.b].push(e.a) })
  const order = [...sessions.keys()].sort((x, y) => adj[y].length - adj[x].length)
  const slotOf = Array(n).fill(null), roomOf = Array(n).fill(null); let steps = 0
  const roomFor = (i, slot) => {
    const s = sessions[i], lab = p.courses.find((c) => c.code === s.course).type === 'Lab'
    const d = p.divisions.find((x) => x.name === s.division)
    const need = s.batch ? d.strength / String(d.batches).split(',').length : d.strength
    return p.rooms.find((r) => (r.type === 'Lab') === lab && r.capacity >= need && !sessions.some((_, k) => slotOf[k] === slot && roomOf[k] === r.name))
  }
  const go = (k) => {
    if (k === n) return true
    if (++steps > limit) return false
    const i = order[k]
    for (const slot of slots) {
      if (adj[i].some((j) => slotOf[j] === slot)) continue
      const r = roomFor(i, slot); if (!r) continue
      slotOf[i] = slot; roomOf[i] = r.name
      if (go(k + 1)) return true
      slotOf[i] = null; roomOf[i] = null
    }
    return false
  }
  const ok = go(0)
  return { ok, steps, sessions: ok ? sessions.map((s, i) => ({ ...s, slot: slotOf[i], room: roomOf[i] })) : sessions }
}
