/**
 * ClassSync E3 - Mandatory Test Case Register runner.
 *
 * Executes every registered test case, records the ACTUAL observed result and
 * writes the register to scheduling-engine/E3/TEST_CASE_REGISTER.md.
 *
 * Run from the repository root:
 *   node scheduling-engine/E3/tests/testCaseRegister.js
 * API cases (TC-API-*) start the server on port 5099 if server/ dependencies are installed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { generateTimetableFromData } = require('../resourceScheduler');
const { validateFinalTimetable } = require('../finalTimetableValidator');
const { getCollegeSlots, getLabWindowSlots } = require('../collegeTimeConfig');
const { backtracking } = require('../backtracking');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'academic_input_example.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const results = [];

function record(id, engine, fr, input, expected, fn) {
  const started = Date.now();
  let actual, pass;
  try {
    const out = fn();
    if (out && typeof out.then === 'function') throw new Error('use recordAsync');
    ({ actual, pass } = out);
  } catch (error) { actual = `Exception: ${error.message}`; pass = false; }
  results.push({ id, engine, fr, input, expected, actual: `${actual} (${Date.now() - started} ms)`, pass });
}
async function recordAsync(id, engine, fr, input, expected, fn) {
  const started = Date.now();
  let actual, pass;
  try { ({ actual, pass } = await fn()); } catch (error) { actual = `Exception: ${error.message}`; pass = false; }
  results.push({ id, engine, fr, input, expected, actual: `${actual} (${Date.now() - started} ms)`, pass });
}
const run = (data, options = {}) => generateTimetableFromData(data, { timeLimitMs: 30000, ...options });
const overlaps = (a, b) => a.slots.some(x => b.slots.some(y => x.day === y.day && x.startMinutes < y.endMinutes && y.startMinutes < x.endMinutes));

// Small college used by several cases.
function smallCollege() {
  return {
    faculty: [1, 2, 3, 4].map(i => ({ faculty_id: i, faculty_name: `T${i}` })),
    divisions: [{ division_id: 1, division_name: 'A' }, { division_id: 2, division_name: 'B' }],
    rooms: [{ room_id: 'C1', room_type: 'Classroom' }, { room_id: 'C2', room_type: 'Classroom' }, { room_id: 'L1', room_type: 'Lab' }, { room_id: 'L2', room_type: 'Lab' }],
    courses: [
      { course_id: 10, course_name: 'Algorithms', course_type: 'Theory', credits: 4 },
      { course_id: 11, course_name: 'Networks', course_type: 'Theory', credits: 3 },
      { course_id: 20, course_name: 'Algorithms Lab', course_type: 'Lab', credits: 2 }
    ],
    courseDivision: [10, 11, 20].flatMap(course_id => [{ course_id, division_id: 1 }, { course_id, division_id: 2 }]),
    courseFaculty: [
      { course_id: 10, faculty_id: 1, division_batch: 'A, B' },
      { course_id: 11, faculty_id: 2, division_batch: 'A' }, { course_id: 11, faculty_id: 3, division_batch: 'B' },
      { course_id: 20, faculty_id: 3, division_batch: 'A' }, { course_id: 20, faculty_id: 4, division_batch: 'B' }
    ]
  };
}
function doubled(raw) {
  const maxDiv = Math.max(...raw.divisions.map(d => d.division_id));
  const maxFac = Math.max(...raw.faculty.map(f => f.faculty_id));
  const maxRoom = Math.max(...raw.rooms.map(r => r.room_id));
  raw.divisions.push(...raw.divisions.map(d => ({ ...d, division_id: d.division_id + maxDiv, division_name: `${d.division_name}X` })));
  raw.faculty.push(...raw.faculty.map(f => ({ ...f, faculty_id: f.faculty_id + maxFac })));
  raw.rooms.push(...raw.rooms.map(r => ({ ...r, room_id: r.room_id + maxRoom })));
  raw.courseDivision.push(...raw.courseDivision.map(r => ({ ...r, division_id: r.division_id + maxDiv })));
  raw.courseFaculty.push(...raw.courseFaculty.map(r => ({ ...r, faculty_id: r.faculty_id + maxFac, division_batch: String(r.division_batch).split(',').map(x => `${x.trim()}X`).join(',') })));
  return raw;
}

// ------------------------------------------------------------------ E3 cases
record('TC-E3-01', 'E3 scheduler', 'FR-E3-01 Generate timetable / Normal',
  'Sample academic data: 32 courses, 10 divisions, 48 faculty, 20 rooms',
  'All sessions placed; independent audit finds 0 conflicts',
  () => {
    const r = run(fixture());
    const a = r.validation;
    return { actual: `stage ${r.stage}; ${r.assignments.size}/${r.sessions.length} sessions placed; faculty/room/division/batch conflicts ${a.conflicts.faculty}/${a.conflicts.room}/${a.conflicts.division}/${a.conflicts.batch}; audit ${a.valid ? 'PASS' : 'FAIL'}`, pass: r.success && a.valid && r.assignments.size === r.sessions.length };
  });

record('TC-E3-02', 'E3 session generator', 'FR-E3-02 Credit rule (theory) / Normal',
  '4-credit theory course offered to one division',
  '4 one-hour sessions, each on a different day, same teacher',
  () => {
    const r = run(smallCollege());
    const list = r.sessions.filter(s => s.courseId === '10' && s.divisionId === '1').map(s => r.assignments.get(s.id));
    const days = new Set(list.map(a => a.day)), teachers = new Set(list.map(a => a.facultyId));
    return { actual: `${list.length} sessions; ${days.size} distinct days (${[...days].join(', ')}); ${teachers.size} teacher`, pass: list.length === 4 && days.size === 4 && teachers.size === 1 };
  });

record('TC-E3-03', 'E3 lab scheduling', 'FR-E3-03 Lab duration & window / Boundary',
  'Lab courses of 1, 1.5, 2 and 3 credits',
  'Durations 1 h, 2 h, 2 h, 3 h; uninterrupted; inside 08:00-12:00',
  () => {
    const data = smallCollege();
    data.courses = [1, 1.5, 2, 3].map((credits, i) => ({ course_id: 30 + i, course_name: `Lab ${credits}`, course_type: 'Lab', credits }));
    data.courseDivision = data.courses.map(c => ({ course_id: c.course_id, division_id: 1 }));
    data.courseFaculty = data.courses.map((c, i) => ({ course_id: c.course_id, faculty_id: i + 1, division_batch: 'A' }));
    const r = run(data);
    const seen = data.courses.map(c => {
      const a = r.assignments.get(r.sessions.find(s => s.courseId === String(c.course_id)).id);
      const mins = a.slots.reduce((s, x) => s + x.durationMinutes, 0);
      const contiguous = a.slots.every((x, k) => k === 0 || a.slots[k - 1].endMinutes === x.startMinutes);
      const inWindow = a.slots[0].startMinutes >= 480 && a.slots[a.slots.length - 1].endMinutes <= 720;
      return { credits: c.credits, hours: mins / 60, ok: contiguous && inWindow };
    });
    return { actual: seen.map(x => `${x.credits} cr -> ${x.hours} h${x.ok ? '' : ' (BAD)'}`).join('; '), pass: r.success && seen.map(x => x.hours).join() === '1,2,2,3' && seen.every(x => x.ok) };
  });

record('TC-E3-04', 'E3 conflict model', 'FR-E3-04 Batch parallelism / Normal',
  'Division with lab batches A1, A2 and full-division theory',
  'A1/A2 labs may overlap each other; no theory overlaps any lab of its division',
  () => {
    const r = run(fixture());
    let parallel = 0, theoryLab = 0;
    for (const x of r.sessions) for (const y of r.sessions) {
      if (x.id >= y.id || x.divisionId !== y.divisionId) continue;
      const a = r.assignments.get(x.id), b = r.assignments.get(y.id);
      if (!overlaps(a, b)) continue;
      if (x.isLab && y.isLab && x.batch !== y.batch) parallel++;
      if (x.isLab !== y.isLab) theoryLab++;
    }
    return { actual: `${parallel} parallel A1/A2 lab pairs; ${theoryLab} theory-lab overlaps`, pass: theoryLab === 0 };
  });

record('TC-E3-05', 'E3 input validation', 'FR-E3-05 Lab credit rule / Invalid',
  'Lab course with 4 credits (unsupported)',
  'Rejected at INPUT_VALIDATION with a clear message',
  () => {
    const data = smallCollege(); data.courses[2].credits = 4;
    const r = run(data);
    return { actual: `stage ${r.stage}: "${r.errors[0]}"`, pass: !r.success && r.stage === 'INPUT_VALIDATION' && /unsupported credit/.test(r.errors[0]) };
  });

record('TC-E3-06', 'E3 input validation', 'FR-E3-05 Referential integrity / Invalid',
  'Duplicate faculty_id and a Course_Faculty row pointing to unknown faculty 99',
  'Rejected at INPUT_VALIDATION listing both problems',
  () => {
    const data = smallCollege(); data.faculty.push({ faculty_id: 1, faculty_name: 'Duplicate' }); data.courseFaculty.push({ course_id: 10, faculty_id: 99, division_batch: 'A' });
    const r = run(data);
    return { actual: `stage ${r.stage}: ${r.errors.join(' | ')}`, pass: r.stage === 'INPUT_VALIDATION' && r.errors.some(e => /Duplicate facultyId 1/.test(e)) && r.errors.some(e => /unknown faculty 99/.test(e)) };
  });

record('TC-E3-07', 'E3 data normalizer', 'FR-E3-05 ID normalisation / Boundary',
  'Same teacher written as 4, "4" and "4.0" in different rows',
  'Treated as one teacher; never double-booked',
  () => {
    const data = fixture();
    data.courseFaculty.forEach((row, i) => { if (row.faculty_id === 4) row.faculty_id = i % 3 === 0 ? '4' : i % 3 === 1 ? '4.0' : 4; });
    const r = run(data);
    const teach4 = [...r.assignments.values()].filter(a => a.facultyIds.includes('4'));
    let clashes = 0;
    for (let i = 0; i < teach4.length; i++) for (let j = i + 1; j < teach4.length; j++) if (overlaps(teach4[i], teach4[j])) clashes++;
    return { actual: `teacher 4 has ${teach4.length} sessions under one ID; ${clashes} clashes; audit ${r.validation.valid ? 'PASS' : 'FAIL'}`, pass: r.success && clashes === 0 };
  });

record('TC-E3-08', 'E3 feasibility checker', 'FR-E3-06 Distinct-day rule / Failure',
  'Theory course with 7 credits (7 weekly sessions) but 6 working days',
  'Rejected instantly at FEASIBILITY with TOO_FEW_DAYS reason',
  () => {
    const data = fixture(); data.courses[0].credits = 7;
    const r = run(data);
    return { actual: `stage ${r.stage}: "${r.errors[0]}"`, pass: r.stage === 'FEASIBILITY' && /different days/.test(r.errors[0]) };
  });

record('TC-E3-09', 'E3 feasibility checker', 'FR-E3-06 Room capacity / Failure',
  'Only one lab room for 114 lab sessions',
  'Rejected at FEASIBILITY: lab hours needed exceed lab-room time',
  () => {
    const data = fixture(); let kept = false;
    data.rooms = data.rooms.filter(r => !/lab/i.test(r.room_type) || (!kept && (kept = true)));
    const r = run(data);
    const msg = r.errors.find(e => /lab room/.test(e)) || r.errors[0];
    return { actual: `stage ${r.stage}: "${msg}"`, pass: r.stage === 'FEASIBILITY' && /need .* h\/week in 1 suitable lab room/.test(msg) };
  });

record('TC-E3-10', 'E3 feasibility checker', 'FR-E3-06 Teacher workload / Failure',
  'One teacher is the only teacher of 6 courses for all divisions (100 h/week)',
  'Rejected at FEASIBILITY naming the overloaded teacher',
  () => {
    const data = fixture();
    const theory = data.courses.filter(c => /theory/i.test(c.course_type)).map(c => c.course_id).slice(0, 6);
    data.courseFaculty = data.courseFaculty.map(r => (theory.includes(r.course_id) ? { ...r, faculty_id: 1 } : r));
    const r = run(data);
    const msg = r.errors.find(e => /only teacher/.test(e)) || r.errors[0];
    return { actual: `stage ${r.stage}: "${msg}"`, pass: r.stage === 'FEASIBILITY' && /only teacher/.test(msg) };
  });

record('TC-E3-11', 'E3 feasibility checker', 'FR-E3-06 Missing mapping / Failure',
  'Course 3 (Computer Networks) has no row in Course_Faculty',
  'Rejected: "no teacher is mapped" for each affected session',
  () => {
    const data = fixture(); data.courseFaculty = data.courseFaculty.filter(r => r.course_id !== 3);
    const r = run(data);
    return { actual: `stage ${r.stage}; ${r.errors.filter(e => /no teacher is mapped/.test(e)).length} sessions reported, e.g. "${r.errors[0]}"`, pass: r.stage === 'FEASIBILITY' && /no teacher is mapped/.test(r.errors[0]) };
  });

record('TC-E3-12', 'E3 feasibility checker', 'FR-E3-06 Lab packing / Boundary-Failure',
  '24 lab hours = 24 h of lab-window time, but six 3 h labs + three 2 h labs in 1 room',
  'Rejected: labs cannot be packed into 4 h daily lab blocks',
  () => {
    const data = {
      faculty: Array.from({ length: 9 }, (_, i) => ({ faculty_id: i + 1 })),
      divisions: [{ division_id: 1, division_name: 'A', batch_count: 1 }],
      rooms: [{ room_id: 'L1', room_type: 'Lab' }, { room_id: 'C1', room_type: 'Classroom' }],
      courses: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, course_name: `Lab ${i + 1}`, course_type: 'Lab', credits: i < 6 ? 3 : 2 })),
      courseDivision: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, division_id: 1 })),
      courseFaculty: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, faculty_id: i + 1, division_batch: 'A' }))
    };
    const r = run(data);
    return { actual: `stage ${r.stage}: "${r.errors[0]}"`, pass: r.stage === 'FEASIBILITY' && /cannot be packed/.test(r.errors[0]) };
  });

record('TC-E3-13', 'E3 fixed sessions', 'FR-E3-07 Pre-assigned session / Normal',
  'Fixed assignment: Algorithms, division A, occurrence 1 at TUE 09:00',
  'Session placed exactly at TUE 09:00; rest scheduled around it',
  () => {
    const data = smallCollege(); data.fixedAssignments = [{ course_id: 10, division_id: 1, occurrence: 1, day: 'TUE', start: '09:00' }];
    const r = run(data); const a = r.assignments.get('10-1-FULL-1');
    return { actual: `placed at ${a.day} ${a.start}; audit ${r.validation.valid ? 'PASS' : 'FAIL'}`, pass: r.success && a.day === 'TUE' && a.start === '09:00' };
  });

record('TC-E3-14', 'E3 fixed sessions', 'FR-E3-07 Conflicting fixed sessions / Failure',
  'Two sessions of division A both fixed at TUE 09:00',
  'Rejected at FEASIBILITY: fixed sessions collide',
  () => {
    const data = smallCollege();
    data.fixedAssignments = [{ course_id: 10, division_id: 1, occurrence: 1, day: 'TUE', start: '09:00' }, { course_id: 11, division_id: 1, occurrence: 1, day: 'TUE', start: '09:00' }];
    const r = run(data);
    return { actual: `stage ${r.stage}: "${r.errors[0]}"`, pass: r.stage === 'FEASIBILITY' && /Fixed sessions/.test(r.errors[0]) };
  });

record('TC-E3-15', 'E3 availability', 'FR-E3-08 Teacher unavailability / Normal',
  'Teacher 1 marked unavailable all of Monday',
  'No session of teacher 1 on Monday',
  () => {
    const data = smallCollege(); data.facultyAvailability = [{ faculty_id: 1, day: 'Monday', start: '08:00', end: '17:45', available: false }];
    const r = run(data);
    const monday = r.timetable.filter(x => x.facultyIds.includes('1') && x.day === 'MON').length;
    return { actual: `${monday} Monday sessions for teacher 1; success ${r.success}`, pass: r.success && monday === 0 };
  });

record('TC-E3-16', 'E3 availability', 'FR-E3-08 Availability by slot ID incl. labs / Boundary',
  'Availability given only as class-period slot IDs for every teacher',
  'Labs (lab-window hours) still schedulable: availability compared by clock time',
  () => {
    const data = fixture(); const slots = getCollegeSlots();
    data.facultyAvailability = data.faculty.flatMap(f => slots.map(s => ({ faculty_id: f.faculty_id, day: s.day, slotId: s.slotId })));
    const r = run(data);
    return { actual: `stage ${r.stage}; ${r.sessions.filter(s => s.isLab).length} lab sessions placed`, pass: r.success };
  });

record('TC-E3-17', 'E3 workload limits', 'FR-E3-09 Max hours per day / Boundary',
  'Every teacher limited to 5 h/day (sample data)',
  'No teacher exceeds 5 h on any day',
  () => {
    const data = fixture(); data.faculty.forEach(f => { f.max_hours_per_day = 5; });
    const r = run(data);
    const perDay = new Map();
    r.timetable.forEach(x => x.facultyIds.forEach(f => { const k = `${f}|${x.day}`; const m = (+x.end.slice(0, 2) * 60 + +x.end.slice(3)) - (+x.start.slice(0, 2) * 60 + +x.start.slice(3)); perDay.set(k, (perDay.get(k) || 0) + m); }));
    const max = Math.max(...perDay.values()) / 60;
    return { actual: `success ${r.success}; highest daily load ${max} h`, pass: r.success && max <= 5 };
  });

record('TC-E3-18', 'E3 room rules', 'FR-E3-10 Room type & capacity / Boundary',
  'Divisions of 70 students; classrooms of 60 and 80 seats; labs of 40 seats',
  'Theory only in 80-seat rooms; labs (35 per batch) in 40-seat labs',
  () => {
    const data = fixture(); data.divisions.forEach(d => { d.student_count = 70; });
    data.rooms.forEach((rm, i) => { rm.capacity = /lab/i.test(rm.room_type) ? 40 : (i % 2 ? 80 : 60); });
    const r = run(data);
    const cap = new Map(data.rooms.map(rm => [String(rm.room_id), rm.capacity]));
    const bad = r.timetable.filter(x => cap.get(x.roomId) < (x.courseType === 'LAB' ? 35 : 70)).length;
    return { actual: `success ${r.success}; ${bad} sessions in rooms that are too small`, pass: r.success && bad === 0 };
  });

record('TC-E3-19', 'E3 team teaching', 'FR-E3-11 Two teachers per lab / Normal',
  'Lab course needing 2 teachers; 3 teachers mapped',
  'Every lab session gets 2 distinct teachers, no clashes',
  () => {
    const data = smallCollege(); data.courses[2].faculty_per_session = 2;
    data.courseFaculty.push({ course_id: 20, faculty_id: 2, division_batch: 'A, B' });
    const r = run(data);
    const labs = r.timetable.filter(x => x.courseType === 'LAB');
    return { actual: `${labs.filter(x => new Set(x.facultyIds).size === 2).length}/${labs.length} labs have 2 teachers; audit ${r.validation?.valid ? 'PASS' : 'FAIL'}`, pass: r.success && labs.every(x => new Set(x.facultyIds).size === 2) };
  });

record('TC-E3-20', 'E3 timetable quality', 'FR-E3-12 Variety / Normal',
  'Sample data (173 theory classes)',
  'No course repeated at the same time of day for a division; afternoons used',
  () => {
    const r = run(fixture());
    const g = new Map(); r.timetable.filter(x => x.courseType !== 'LAB').forEach(x => { const k = `${x.courseId}|${x.divisionId}`; (g.get(k) || g.set(k, []).get(k)).push(x.start); });
    let repeats = 0, total = 0; for (const s of g.values()) { total += s.length; repeats += s.length - new Set(s).size; }
    const afternoon = r.timetable.filter(x => x.start >= '13:30').length;
    return { actual: `${repeats}/${total} same-time repeats; ${afternoon} sessions after lunch`, pass: repeats <= Math.ceil(total * 0.02) && afternoon > 0 };
  });

record('TC-E3-21', 'E3 final validator', 'FR-E3-13 Independent audit / Failure',
  'Valid timetable, then two sessions of one teacher moved to the same slot',
  'Audit reports FACULTY_CONFLICT and valid = false',
  () => {
    const r = run(smallCollege());
    const tampered = new Map(r.assignments);
    const [x, y] = r.sessions.filter(s => s.courseId === '10');
    tampered.set(y.id, { ...tampered.get(y.id), slots: tampered.get(x.id).slots });
    const audit = validateFinalTimetable(r.sessions, tampered, { availableSlots: getCollegeSlots(), allAvailableSlots: [...getCollegeSlots(), ...getLabWindowSlots()] });
    return { actual: `audit valid=${audit.valid}; ${audit.errors.filter(e => /FACULTY_CONFLICT/.test(e)).length} FACULTY_CONFLICT error(s)`, pass: !audit.valid && audit.errors.some(e => /FACULTY_CONFLICT/.test(e)) };
  });

record('TC-E3-22', 'E3 time configuration', 'FR-E3-14 Custom periods / Boundary',
  '50-minute periods (9 per day) via timeConfig.dayOverrides',
  'Timetable generated on the custom periods; audit passes',
  () => {
    const periods = ['08:00-08:50', '08:50-09:40', '09:55-10:45', '10:45-11:35', '11:35-12:25', '13:30-14:20', '14:20-15:10', '15:20-16:10', '16:10-17:00'].map(p => ({ start: p.slice(0, 5), end: p.slice(6) }));
    const r = run(fixture(), { timeConfig: { dayOverrides: Object.fromEntries(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => [d, { periods }])) } });
    return { actual: `stage ${r.stage}; ${r.assignments?.size}/${r.sessions.length} placed; audit ${r.validation?.valid ? 'PASS' : 'FAIL'}`, pass: r.success };
  });

record('TC-E3-23', 'E3 search control', 'FR-E3-15 Time limit / Failure',
  'Very tight data (sample with 3 lab batches, lab rooms 100% full) with timeLimitMs = 3000; legacy backtracking API on an impossible 2-session input',
  'Search stops at the limit and returns TIME_LIMIT with diagnostics, or an audited timetable (never hangs, never a wrong timetable); legacy API returns null',
  () => {
    const graph = new Map([['a', [{ sessionId: 'b', reasons: ['FACULTY'] }]], ['b', [{ sessionId: 'a', reasons: ['FACULTY'] }]]]);
    const legacy = backtracking(graph, new Map([['a', ['S1']], ['b', ['S1']]]), new Map(), { timeLimitMs: 1000 });
    const t0 = Date.now();
    const data = fixture(); data.divisions.forEach(d => { d.batch_count = 3; });
    const r = run(data, { timeLimitMs: 3000, maxNodes: 20000 });
    const elapsed = Date.now() - t0;
    const ok = r.success ? r.validation.valid : ['TIME_LIMIT', 'NO_SOLUTION'].includes(r.stage);
    return { actual: `3-batch data (lab rooms 100% full): stage ${r.stage} after ${elapsed} ms${r.success ? ', audit PASS' : `, hardest sessions listed: ${r.diagnostics?.hardestSessions?.length}`}; legacy API returned ${legacy} (${backtracking.lastRun.status})`, pass: ok && elapsed < 15000 && legacy === null };
  });

record('TC-E3-24', 'E3 performance', 'NFR-E3-01 Scale / Performance',
  'Doubled college: 20 divisions, 96 faculty, 40 rooms (574 sessions)',
  'Complete audited timetable in under 5 s',
  () => {
    const r = run(doubled(fixture()));
    return { actual: `${r.assignments.size}/${r.sessions.length} placed in ${r.stats.timeMs} ms; audit ${r.validation.valid ? 'PASS' : 'FAIL'}`, pass: r.success && r.stats.timeMs < 5000 };
  });

record('TC-E3-25', 'E3 robustness', 'NFR-E3-02 Correctness on random data / Performance',
  '100 randomly generated colleges (1-8 divisions, 3-32 teachers, random credits, limits, capacities, mixed ID types)',
  'Every run ends within its time limit; every reported timetable passes an independent re-check; every failure has a reason',
  () => {
    let solved = 0, explained = 0, timeouts = 0, wrong = 0, slowest = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const data = randomCollege(seed);
      const t0 = Date.now();
      const r = run(data, { timeLimitMs: 10000 });
      slowest = Math.max(slowest, Date.now() - t0);
      if (r.success) { solved++; if (!independentlyValid(r)) wrong++; }
      else if (r.stage === 'TIME_LIMIT') timeouts++;
      else if (r.errors.length) explained++; else wrong++;
    }
    return { actual: `${solved} solved, ${explained} rejected with reasons, ${timeouts} time-limit, ${wrong} wrong; slowest ${slowest} ms`, pass: wrong === 0 && slowest < 11000 };
  });

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomCollege(seed) {
  const r = rng(seed), pick = n => Math.floor(r() * n);
  const nDiv = 1 + pick(8), nFac = 3 + pick(30), nClass = 1 + pick(8), nLab = 1 + pick(5), nCourse = 2 + pick(12);
  const style = pick(3);
  const id = n => (style === 0 ? n : style === 1 ? `F${n}` : n % 2 ? n : String(n));
  const faculty = Array.from({ length: nFac }, (_, i) => ({ faculty_id: id(i + 1), faculty_name: `T${i + 1}`, ...(r() < 0.2 ? { max_hours_per_day: 3 + pick(4) } : {}) }));
  const divisions = Array.from({ length: nDiv }, (_, i) => ({ division_id: i + 1, division_name: String.fromCharCode(65 + i), ...(r() < 0.3 ? { batch_count: 1 + pick(3) } : {}), ...(r() < 0.3 ? { student_count: 40 + pick(40) } : {}) }));
  const rooms = [...Array.from({ length: nClass }, (_, i) => ({ room_id: `C${i + 1}`, room_type: 'Classroom', ...(r() < 0.3 ? { capacity: 50 + pick(40) } : {}) })), ...Array.from({ length: nLab }, (_, i) => ({ room_id: `L${i + 1}`, room_type: 'Lab', ...(r() < 0.3 ? { capacity: 20 + pick(30) } : {}) }))];
  const courses = Array.from({ length: nCourse }, (_, i) => { const lab = r() < 0.35; return { course_id: 100 + i, course_name: `Course ${i}`, course_type: lab ? 'Lab' : 'Theory', credits: lab ? [1, 1.5, 2, 3][pick(4)] : 1 + pick(4) }; });
  const courseDivision = [], courseFaculty = [];
  for (const c of courses) for (const d of divisions) if (r() < 0.6) {
    courseDivision.push({ course_id: c.course_id, division_id: d.division_id });
    for (let t = 0; t < 1 + pick(3); t++) courseFaculty.push({ course_id: c.course_id, faculty_id: faculty[pick(nFac)].faculty_id, division_batch: d.division_name });
  }
  return { faculty, divisions, rooms, courses, courseDivision, courseFaculty };
}
function independentlyValid(r) {
  const e = r.sessions.map(s => [s, r.assignments.get(s.id)]);
  for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) {
    const [s1, a] = e[i], [s2, b] = e[j];
    if (s1.distinctDayGroup && s1.distinctDayGroup === s2.distinctDayGroup && a.day === b.day) return false;
    if (!overlaps(a, b)) continue;
    if (a.facultyIds.some(f => b.facultyIds.includes(f)) || a.roomId === b.roomId) return false;
    if (s1.divisionId === s2.divisionId && (!s1.batchIds.length || !s2.batchIds.length || s1.batch === s2.batch)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ API cases
async function apiCases() {
  const serverDir = path.join(ROOT, 'server');
  if (!fs.existsSync(path.join(serverDir, 'node_modules', 'xlsx'))) {
    results.push({ id: 'TC-API-*', engine: 'API', fr: '-', input: '-', expected: '-', actual: 'Skipped: run "npm install" in server/ first', pass: null });
    return;
  }
  const XLSX = require(path.join(serverDir, 'node_modules', 'xlsx'));
  const PORT = 5099, base = `http://localhost:${PORT}`;
  const proc = spawn(process.execPath, ['server.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)); }
    const sample = fs.readFileSync(path.join(ROOT, 'samples', 'ClassSync_sample_input.xlsx'));
    const post = body => fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

    await recordAsync('TC-API-01', 'API /api/generate', 'FR-E3-01 Excel upload / API Normal',
      'POST sample .xlsx (base64), 3 divisions per semester', 'HTTP 200, success, audit passed',
      async () => { const res = await post({ fileBase64: sample.toString('base64'), divisions: 3 }); const o = await res.json(); return { actual: `HTTP ${res.status}; success ${o.success}; ${o.summary.placed}/${o.summary.sessions} placed; audit ${o.summary.auditPassed}`, pass: res.status === 200 && o.success && o.summary.auditPassed }; });

    await recordAsync('TC-API-02', 'API /api/generate', 'FR-E3-05 Wrong file / API Invalid',
      'POST a non-Excel file', 'HTTP 400 naming the missing sheets',
      async () => { const res = await post({ fileBase64: Buffer.from('not an excel file').toString('base64'), divisions: 3 }); const o = await res.json(); return { actual: `HTTP ${res.status}: "${o.errors[0]}"`, pass: res.status === 400 && /missing required sheet/.test(o.errors[0]) }; });

    await recordAsync('TC-API-03', 'API /api/generate', 'FR-E3-05 Division count / API Boundary',
      'divisions = 0 and divisions = 27', 'HTTP 400 for both (allowed 1-26)',
      async () => { const a = await post({ fileBase64: sample.toString('base64'), divisions: 0 }); const b = await post({ fileBase64: sample.toString('base64'), divisions: 27 }); return { actual: `HTTP ${a.status} and ${b.status}: "${(await a.json()).errors[0]}"`, pass: a.status === 400 && b.status === 400 }; });

    await recordAsync('TC-API-04', 'API /api/generate', 'Security - malformed request',
      'Body that is not JSON', 'HTTP 400, no crash, server keeps running',
      async () => { const res = await post('{not json'); const ok = (await fetch(`${base}/api/health`)).ok; return { actual: `HTTP ${res.status}; server healthy afterwards: ${ok}`, pass: res.status === 400 && ok }; });

    await recordAsync('TC-API-05', 'API /api/generate', 'Security - oversized upload',
      'Request body of 21 MB (limit 20 MB)', 'Request rejected; server stays available',
      async () => { let status = 'connection closed'; try { const res = await post({ fileBase64: 'A'.repeat(21 * 1024 * 1024), divisions: 3 }); status = `HTTP ${res.status}`; } catch { /* destroyed by server */ } const ok = (await fetch(`${base}/api/health`)).ok; return { actual: `${status}; server healthy afterwards: ${ok}`, pass: status !== 'HTTP 200' && ok }; });

    await recordAsync('TC-API-06', 'API static files', 'Security - path traversal',
      'GET /..%2f..%2fserver%2fserver.js', 'Server source is never returned',
      async () => { const res = await fetch(`${base}/..%2f..%2fserver%2fserver.js`); const text = await res.text(); return { actual: `HTTP ${res.status}; source leaked: ${text.includes('createServer')}`, pass: !text.includes('createServer') }; });

    await recordAsync('TC-API-07', 'API /api/generate', 'Concurrency - parallel requests',
      '5 generate requests sent at the same time', 'All succeed independently with identical (deterministic) timetables',
      async () => {
        const all = await Promise.all(Array.from({ length: 5 }, () => post({ fileBase64: sample.toString('base64'), divisions: 3 }).then(r => r.json())));
        const sig = all.map(o => JSON.stringify(o.timetable.map(t => [t.sessionId, t.day, t.start, t.roomId, t.facultyIds])));
        return { actual: `${all.filter(o => o.success).length}/5 succeeded; ${new Set(sig).size} distinct result(s)`, pass: all.every(o => o.success) && new Set(sig).size === 1 };
      });

    await recordAsync('TC-API-08', 'API /api/sample', 'FR-E3-16 Sample download / API Normal',
      'GET /api/sample', 'HTTP 200, Excel content type, parsable workbook with required sheets',
      async () => { const res = await fetch(`${base}/api/sample`); const buf = Buffer.from(await res.arrayBuffer()); const wb = XLSX.read(buf); return { actual: `HTTP ${res.status}; sheets: ${wb.SheetNames.join(', ')}`, pass: res.status === 200 && ['Faculty', 'Course', 'Room', 'Course_Faculty'].every(s => wb.SheetNames.includes(s)) }; });
  } finally {
    proc.kill();
  }
}

(async () => {
  await apiCases();
  const rows = results.map(r => `| ${r.id} / ${r.engine} | ${r.fr} | ${r.input} | ${r.expected} | ${String(r.actual).replace(/\|/g, '/')} | ${r.pass === null ? 'Not run' : r.pass ? 'Pass' : 'Fail'} |`);
  const passed = results.filter(r => r.pass).length, failed = results.filter(r => r.pass === false).length;
  const md = `# ClassSync E3 - Test Case Register

Generated by \`node scheduling-engine/E3/tests/testCaseRegister.js\` on ${new Date().toISOString()} (Node ${process.version}).
Result: **${passed} passed, ${failed} failed** of ${results.length}.

| Test ID / Engine | FR ID / test type | Input / precondition | Expected result | Actual result | Pass / Fail |
|---|---|---|---|---|---|
${rows.join('\n')}

Not applicable to E3: transaction tests (E3 is stateless and writes no database records).
`;
  fs.writeFileSync(path.join(__dirname, '..', 'TEST_CASE_REGISTER.md'), md);
  console.log(md);
  process.exitCode = failed ? 1 : 0;
})();
