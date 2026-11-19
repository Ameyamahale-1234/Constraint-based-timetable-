// Bridge between E1 data, the E2 validation engine (e2/engine.js) and the real E3 engine (server API).

const DAY_E1 = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }
const list = (v) => String(v ?? '').split(/[,;/|]/).map((x) => x.trim()).filter(Boolean)

// College default periods (same as the E3 engine) used when the Time Slots page is empty.
const DEFAULT_PERIODS = [['08:00', '09:00'], ['09:00', '10:00'], ['10:15', '11:15'], ['11:15', '12:15'], ['13:30', '14:30'], ['14:30', '15:30'], ['15:45', '16:45'], ['16:45', '17:45']]
export const DEFAULT_SLOTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].flatMap((day) =>
  (day === 'Sat' ? DEFAULT_PERIODS.slice(0, 4) : DEFAULT_PERIODS).map(([start, end]) => ({ day, start, end })))

/** E1 data -> E2 payload (with one session per weekly class / lab batch). */
export function e1ToPayload(e1) {
  const sessions = []
  const divisionOf = (name) => (e1.divisions || []).find((d) => d.name === name)
  for (const a of e1.assignments || []) {
    const course = (e1.courses || []).find((c) => String(c.code) === String(a.course))
    for (const target of list(a.divisions)) {
      let [division, batch] = target.includes(':') ? target.split(':').map((x) => x.trim()) : [target, null]
      if (!divisionOf(division)) {
        const owner = (e1.divisions || []).find((d) => list(d.batches).includes(division))
        if (owner) { batch = division; division = owner.name }
      }
      const d = divisionOf(division)
      const isLab = course && String(course.type).toLowerCase() === 'lab'
      const batches = isLab ? (batch ? [batch] : list(d?.batches)) : [null]
      const count = isLab ? 1 : Math.max(1, Number(course?.hours) || 1)
      for (const b of batches.length ? batches : [null]) {
        for (let k = 0; k < count; k++) {
          sessions.push({ id: `S${sessions.length + 1}`, course: String(a.course), faculty: a.faculty, division, batch: b, slot: null, room: null })
        }
      }
    }
  }
  return {
    courses: e1.courses || [], faculty: e1.faculty || [], rooms: e1.rooms || [], divisions: e1.divisions || [],
    slots: e1.slots?.length ? e1.slots : DEFAULT_SLOTS,
    defaultSlots: !e1.slots?.length,
    sessions,
    e1, // original E1 data, sent to E3 unchanged
  }
}

/** E2 payload -> E1 data for E3 (payloads pasted or loaded from samples are converted). */
export function payloadToE1(p) {
  if (p.e1) return p.e1
  const groups = new Map()
  for (const s of p.sessions || []) {
    const key = `${s.course}|${s.faculty}`
    if (!groups.has(key)) groups.set(key, { course: s.course, faculty: s.faculty, divisions: new Set() })
    groups.get(key).divisions.add(s.batch ? `${s.division}:${s.batch}` : s.division)
  }
  return {
    courses: p.courses || [], faculty: p.faculty || [], rooms: p.rooms || [], divisions: p.divisions || [],
    slots: p.defaultSlots ? [] : p.slots || [],
    assignments: [...groups.values()].map((g) => ({ ...g, divisions: [...g.divisions].join(', ') })),
  }
}

/** E3 timetable rows -> E2 sessions (slot + room filled) so E2 can re-check them. */
export function scheduleFromResult(result) {
  return (result.timetable || []).map((r) => ({
    id: r.sessionId, course: r.courseId, faculty: r.facultyIds[0], division: r.divisionId,
    batch: r.courseType === 'LAB' ? r.batch : null,
    slot: `${DAY_E1[r.day] || r.day} ${r.start}-${r.end}`, room: r.roomId,
  }))
}

export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

async function post(url, body) {
  let response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch (error) {
    return { success: false, stage: 'CONNECTION', errors: [`Could not reach the ClassSync server. Is it running? (${error.message})`], warnings: [], timetable: [] }
  }
  return response.json()
}

/** Runs the real E3 engine on E1 data. */
export const generateWithE3 = (e1, opts = {}) => post('/api/generate', { data: e1, ...opts })
/** Reads an Excel workbook into E1 data. */
export const importExcel = (fileBase64, divisions) => post('/api/import', { fileBase64, divisions })
