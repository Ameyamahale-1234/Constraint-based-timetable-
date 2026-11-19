/**
 * Converts between the E1 data-entry model used by the web app and the raw
 * academic data the E3 engine expects.
 *
 * E1 model (one array per page, as stored by the frontend):
 *   courses     { code, name, type: Theory|Lab|Project, hours }       hours = credits (theory) or lab length 1-3 h
 *   faculty     { name, dept, maxHours }                               name is the teacher's unique key
 *   rooms       { name, type: Classroom|Lab, capacity }
 *   divisions   { name, semester, batches: "A1,A2", strength }         name is unique (e.g. "4A")
 *   slots       { day: Mon..Sat, start: "08:00", end: "09:00" }        empty = college default periods
 *   assignments { course: <code>, faculty: <name>, divisions: "4A, 4B" or batches "A1" }
 */
const { LAB_DURATION_BY_CREDIT } = require('../scheduling-engine/E3/data/dataNormalizer');

const DAY_CODES = { MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI', SAT: 'SAT', SUN: 'SUN' };
const DAY_E1 = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const str = v => (v == null ? '' : String(v).trim());
const list = v => str(v).split(/[,;/|]/).map(x => x.trim()).filter(Boolean);
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const dayCode = d => DAY_CODES[str(d).toUpperCase().slice(0, 3)] || null;
const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pad = t => (/^\d:\d\d$/.test(t) ? `0${t}` : t);
function cell(row, keys) { for (const k of keys) if (row && row[k] != null && row[k] !== '') return row[k]; return null; }
function uniqueNames(rows, nameOf, idOf) {
  const count = new Map();
  rows.forEach(r => count.set(nameOf(r), (count.get(nameOf(r)) || 0) + 1));
  return rows.map(r => (count.get(nameOf(r)) > 1 ? `${nameOf(r)} (${idOf(r)})` : nameOf(r)));
}

/** Raw workbook rows (after the division count is applied) -> E1 model. */
function rawToE1(raw) {
  const courseIds = raw.courses.map(c => str(cell(c, ['course_id', 'courseId', 'id'])));
  const courseNames = raw.courses.map(c => str(cell(c, ['course_name', 'courseName', 'name'])));
  const courses = raw.courses.map((c, i) => {
    const typeText = str(cell(c, ['course_type', 'courseType', 'type'])).toUpperCase();
    const type = typeText.includes('LAB') || typeText.includes('PRACT') ? 'Lab' : typeText.includes('PROJECT') ? 'Project' : 'Theory';
    const credits = num(cell(c, ['credits', 'credit']));
    const hours = type === 'Lab' ? (num(cell(c, ['duration_hours', 'durationHours'])) ?? LAB_DURATION_BY_CREDIT[credits] ?? credits) : credits;
    return { code: courseIds[i], name: courseNames[i], type, hours };
  });

  const facultyIds = raw.faculty.map(f => str(cell(f, ['faculty_id', 'facultyId', 'id'])));
  const facultyNames = uniqueNames(raw.faculty, f => str(cell(f, ['faculty_name', 'name'])) || str(cell(f, ['faculty_id', 'id'])), f => str(cell(f, ['faculty_id', 'id'])));
  const facultyById = new Map(facultyIds.map((id, i) => [id, facultyNames[i]]));
  const faculty = raw.faculty.map((f, i) => ({ name: facultyNames[i], dept: str(cell(f, ['department', 'dept', 'dept_name', 'dept_id'])), maxHours: num(cell(f, ['max_hours_per_week', 'maxHoursPerWeek'])) ?? '' }));

  const roomNames = uniqueNames(raw.rooms, r => str(cell(r, ['room_name', 'roomName', 'name'])) || str(cell(r, ['room_id', 'id'])), r => str(cell(r, ['room_id', 'id'])));
  const rooms = raw.rooms.map((r, i) => {
    const t = str(cell(r, ['room_type', 'roomType'])).toUpperCase();
    return { name: roomNames[i], type: t.includes('LAB') ? 'Lab' : 'Classroom', capacity: num(cell(r, ['capacity', 'seats'])) ?? '' };
  });

  // Division labels must be unique: add the semester when names repeat (4A, 6A).
  const baseNames = raw.divisions.map(d => str(cell(d, ['division_name', 'divisionName', 'name'])));
  const repeated = baseNames.some((n, i) => baseNames.indexOf(n) !== i);
  const divisionLabelById = new Map();
  const divisions = raw.divisions.map((d, i) => {
    const semester = str(cell(d, ['semester', 'sem']));
    const label = repeated && semester ? `${semester}${baseNames[i]}` : baseNames[i];
    divisionLabelById.set(str(cell(d, ['division_id', 'divisionId', 'id'])), label);
    const count = num(cell(d, ['batch_count', 'num_batches'])) || 2;
    const batches = list(cell(d, ['batches', 'batch_names'])).join(',') || Array.from({ length: count }, (_, k) => `${baseNames[i]}${k + 1}`).join(',');
    return { name: label, semester, batches, strength: num(cell(d, ['student_count', 'strength', 'students'])) ?? '', _base: baseNames[i] };
  });

  // Offerings: course -> division labels.
  const offered = new Map();
  for (const row of raw.courseDivision) {
    const c = str(cell(row, ['course_id', 'courseId'])), d = divisionLabelById.get(str(cell(row, ['division_id', 'divisionId'])));
    if (!d) continue;
    if (!offered.has(c)) offered.set(c, new Set());
    offered.get(c).add(d);
  }
  // Teaching assignments: map each Course_Faculty row's division/batch names onto offered division labels.
  const assignments = [];
  const covered = new Map();
  for (const row of raw.courseFaculty) {
    const course = str(cell(row, ['course_id', 'courseId']));
    const teacher = facultyById.get(str(cell(row, ['faculty_id', 'facultyId'])));
    if (!offered.has(course) || !teacher) continue;
    const wanted = list(cell(row, ['division_batch', 'divisionBatch', 'division']));
    const targets = [];
    for (const label of offered.get(course)) {
      const div = divisions.find(x => x.name === label);
      const batchList = list(div.batches);
      if (!wanted.length || wanted.some(w => w.toUpperCase() === div._base.toUpperCase() || w.toUpperCase() === label.toUpperCase())) targets.push(label);
      else wanted.filter(w => batchList.map(b => b.toUpperCase()).includes(w.toUpperCase())).forEach(b => targets.push(`${label}:${b}`));
    }
    if (!targets.length) continue;
    assignments.push({ course, faculty: teacher, divisions: targets.join(', ') });
    if (!covered.has(course)) covered.set(course, new Set());
    targets.forEach(t => covered.get(course).add(t.split(':')[0]));
  }
  // Offered divisions with no teacher stay visible (E2 and E3 will report them).
  for (const [course, labels] of offered) {
    const missing = [...labels].filter(l => !covered.get(course)?.has(l));
    if (missing.length) assignments.push({ course, faculty: '', divisions: missing.join(', ') });
  }
  divisions.forEach(d => delete d._base);
  const keep = new Set(offered.keys());
  return { courses: courses.filter(c => keep.has(c.code)), faculty, rooms, divisions, slots: [], assignments };
}

/** Periods entered on the Time Slots page -> engine time configuration (null = college defaults). */
function slotsToTimeConfig(slots) {
  const byDay = new Map();
  for (const s of slots || []) {
    const day = dayCode(s.day); const start = pad(str(s.start)), end = pad(str(s.end));
    if (!day || !/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end) || toMin(end) <= toMin(start)) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ start, end });
  }
  if (!byDay.size) return { timeConfig: null, labWindows: null };
  const order = Object.keys(DAY_CODES).filter(d => byDay.has(d));
  const dayOverrides = {};
  for (const d of order) dayOverrides[d] = { periods: byDay.get(d).sort((a, b) => toMin(a.start) - toMin(b.start)) };
  // Lunch = longest gap of at least 30 minutes on the day with most periods.
  const longest = order.map(d => dayOverrides[d].periods).sort((a, b) => b.length - a.length)[0];
  let lunch = null;
  for (let i = 1; i < longest.length; i++) {
    const gap = toMin(longest[i].start) - toMin(longest[i - 1].end);
    if (gap >= 30 && (!lunch || gap > toMin(lunch.end) - toMin(lunch.start))) lunch = { start: longest[i - 1].end, end: longest[i].start };
  }
  // Lab window per day = the first block of periods (gaps up to 15 minutes are bridged), i.e. the morning session.
  const labWindows = order.map(d => {
    const p = dayOverrides[d].periods;
    let end = p[0].end;
    for (let i = 1; i < p.length && toMin(p[i].start) - toMin(end) <= 15; i++) end = p[i].end;
    return { days: [d], start: p[0].start, end };
  });
  return { timeConfig: { workingDays: order, dayOverrides, lunch }, labWindows };
}

/** E1 model -> raw academic data + options for the engine. */
function e1ToRaw(e1) {
  const data = e1 || {};
  const divisions = (data.divisions || []).filter(d => str(d.name));
  const batchOwner = new Map();
  divisions.forEach(d => list(d.batches).forEach(b => { if (!batchOwner.has(b.toUpperCase())) batchOwner.set(b.toUpperCase(), []); batchOwner.get(b.toUpperCase()).push(d.name); }));

  const raw = {
    faculty: (data.faculty || []).filter(f => str(f.name)).map(f => ({ faculty_id: str(f.name), faculty_name: str(f.name), department: str(f.dept) || null, max_hours_per_week: num(f.maxHours) || null })),
    courses: (data.courses || []).filter(c => str(c.code)).map(c => {
      const lab = str(c.type).toUpperCase() === 'LAB';
      return { course_id: str(c.code), course_name: str(c.name) || str(c.code), course_type: str(c.type) || 'Theory', credits: num(c.hours), ...(lab ? { duration_hours: num(c.hours) } : {}) };
    }),
    rooms: (data.rooms || []).filter(r => str(r.name)).map(r => ({ room_id: str(r.name), room_name: str(r.name), room_type: str(r.type) || 'Classroom', capacity: num(r.capacity) || null })),
    divisions: divisions.map(d => ({ division_id: str(d.name), division_name: str(d.name), semester: str(d.semester) || null, batches: list(d.batches).join(','), student_count: num(d.strength) || null })),
    courseFaculty: [],
    courseDivision: []
  };
  const offered = new Set();
  for (const a of data.assignments || []) {
    const course = str(a.course);
    if (!course) continue;
    const targets = list(a.divisions);
    const divisionsHit = new Set();
    const mapping = [];
    for (const t of targets) {
      const [div, batch] = t.includes(':') ? t.split(':').map(x => x.trim()) : [t, null];
      if (divisions.some(d => d.name === div)) { divisionsHit.add(div); mapping.push(batch || div); }
      else if (batchOwner.has(div.toUpperCase())) { batchOwner.get(div.toUpperCase()).forEach(x => divisionsHit.add(x)); mapping.push(div); }
    }
    divisionsHit.forEach(d => { const k = `${course}|${d}`; if (!offered.has(k)) { offered.add(k); raw.courseDivision.push({ course_id: course, division_id: d }); } });
    if (str(a.faculty) && mapping.length) raw.courseFaculty.push({ course_id: course, faculty_id: str(a.faculty), division_batch: mapping.join(', ') });
  }
  const { timeConfig, labWindows } = slotsToTimeConfig(data.slots);
  return { raw, options: { ...(timeConfig ? { timeConfig } : {}), ...(labWindows ? { labWindows } : {}) } };
}

module.exports = { rawToE1, e1ToRaw, slotsToTimeConfig, DAY_E1 };
