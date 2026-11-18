const assert = require('node:assert/strict');
const { generateTimetableFromData } = require('../resourceScheduler');
const { getCollegeSlots } = require('../collegeTimeConfig');
const { backtracking } = require('../backtracking');

// A small but realistic college used as the base for every scenario.
function college() {
  return {
    faculty: [
      { faculty_id: 1, faculty_name: 'T1' }, { faculty_id: 2, faculty_name: 'T2' },
      { faculty_id: 3, faculty_name: 'T3' }, { faculty_id: 4, faculty_name: 'T4' }
    ],
    divisions: [{ division_id: 1, division_name: 'A' }, { division_id: 2, division_name: 'B' }],
    rooms: [
      { room_id: 'C1', room_type: 'Classroom' }, { room_id: 'C2', room_type: 'Classroom' },
      { room_id: 'L1', room_type: 'Lab' }, { room_id: 'L2', room_type: 'Lab' }
    ],
    courses: [
      { course_id: 10, course_name: 'Algorithms', course_type: 'Theory', credits: 4 },
      { course_id: 11, course_name: 'Networks', course_type: 'Theory', credits: 3 },
      { course_id: 20, course_name: 'Algorithms Lab', course_type: 'Lab', credits: 2 }
    ],
    courseDivision: [10, 11, 20].flatMap(course_id => [{ course_id, division_id: 1 }, { course_id, division_id: 2 }]),
    courseFaculty: [
      { course_id: 10, faculty_id: 1, division_batch: 'A, B' },
      { course_id: 11, faculty_id: 2, division_batch: 'A' }, { course_id: 11, faculty_id: 3, division_batch: 'B' },
      { course_id: 20, faculty_id: 3, division_batch: 'A' }, { course_id: 20, faculty_id: 4, division_batch: 'B1, B2' }
    ]
  };
}
const run = (data, options = {}) => generateTimetableFromData(data, { timeLimitMs: 10000, ...options });

// 1. Valid data -> complete timetable that passes the independent audit.
const ok = run(college());
assert.equal(ok.success, true, ok.errors.join('\n'));
assert.equal(ok.validation.valid, true);
assert.equal(ok.assignments.size, ok.sessions.length);
assert.ok(Array.isArray(ok.timetable) && ok.timetable.length === ok.sessions.length);

// 2. Lab batches are named after their division; batch-specific teacher mappings work.
const labBatches = ok.sessions.filter(s => s.isLab).map(s => s.batch).sort();
assert.deepEqual(labBatches, ['A1', 'A2', 'B1', 'B2']);
for (const s of ok.sessions.filter(s => s.isLab && s.divisionName === 'B')) assert.deepEqual(ok.assignments.get(s.id).facultyIds, ['4']);

// 3. A teacher keeps the same course-division for the whole week.
const algoA = ok.sessions.filter(s => s.courseId === '11' && s.divisionId === '1').map(s => ok.assignments.get(s.id).facultyId);
assert.equal(new Set(algoA).size, 1);

// 3b. Variety: a course's weekly classes are not all at the same time of day.
for (const course of ['10', '11']) {
  for (const division of ['1', '2']) {
    const starts = ok.sessions.filter(s => s.courseId === course && s.divisionId === division).map(s => ok.assignments.get(s.id).start);
    assert.equal(new Set(starts).size, starts.length, `course ${course} division ${division} repeats a start time: ${starts}`);
  }
}

// 4. Mixed ID types (4 vs "4" vs "4.0") are the same resource.
const mixed = college();
mixed.courseFaculty[0].faculty_id = '1';
mixed.courseDivision[0].division_id = '1.0';
const mixedResult = run(mixed);
assert.equal(mixedResult.success, true, mixedResult.errors.join('\n'));
assert.ok(mixedResult.sessions.every(s => typeof s.divisionId === 'string'));

// 5. Faculty availability given by class-period slotId still allows labs (compared by time, not slot ID).
const avail = college();
avail.facultyAvailability = avail.faculty.flatMap(f => getCollegeSlots().map(s => ({ faculty_id: f.faculty_id, day: s.day, slotId: s.slotId })));
const availResult = run(avail);
assert.equal(availResult.success, true, availResult.errors.join('\n'));

// 6. "Unavailable" rows are respected.
const blocked = college();
blocked.facultyAvailability = [{ faculty_id: 1, day: 'Monday', start: '08:00', end: '17:45', available: false }];
const blockedResult = run(blocked);
assert.equal(blockedResult.success, true, blockedResult.errors.join('\n'));
assert.ok(blockedResult.timetable.every(r => !(r.facultyIds.includes('1') && r.day === 'MON')));

// 7. Impossible inputs fail FAST with a clear reason (never hang).
const tooManyCredits = college(); tooManyCredits.courses[0].credits = 7;
let r = run(tooManyCredits);
assert.equal(r.success, false); assert.equal(r.stage, 'FEASIBILITY');
assert.ok(r.errors.some(e => /different days/.test(e)));

const noLabRoom = college(); noLabRoom.rooms = noLabRoom.rooms.filter(x => x.room_type !== 'Lab');
r = run(noLabRoom);
assert.equal(r.stage, 'FEASIBILITY'); assert.ok(r.errors.some(e => /no lab room/.test(e)));

const overloaded = college();
overloaded.courses.push(...Array.from({ length: 12 }, (_, i) => ({ course_id: 100 + i, course_name: `Extra ${i}`, course_type: 'Theory', credits: 4 })));
for (let i = 0; i < 12; i++) { overloaded.courseDivision.push({ course_id: 100 + i, division_id: 1 }); overloaded.courseFaculty.push({ course_id: 100 + i, faculty_id: 1, division_batch: 'A' }); }
r = run(overloaded);
assert.equal(r.stage, 'FEASIBILITY'); assert.ok(r.errors.some(e => /T1/.test(e)));

const badRef = college(); badRef.courseFaculty.push({ course_id: 10, faculty_id: 99, division_batch: 'A' });
r = run(badRef);
assert.equal(r.stage, 'INPUT_VALIDATION'); assert.ok(r.errors.some(e => /unknown faculty 99/.test(e)));

// 7b. Lab packing: 24 lab hours fit the 24 h of lab-window time, but six 3-hour
// labs leave only 1-hour gaps, so three 2-hour labs cannot be placed.
const packing = {
  faculty: Array.from({ length: 9 }, (_, i) => ({ faculty_id: i + 1 })),
  divisions: [{ division_id: 1, division_name: 'A', batch_count: 1 }],
  rooms: [{ room_id: 'L1', room_type: 'Lab' }, { room_id: 'C1', room_type: 'Classroom' }],
  courses: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, course_name: `Lab ${i + 1}`, course_type: 'Lab', credits: i < 6 ? 3 : 2 })),
  courseDivision: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, division_id: 1 })),
  courseFaculty: Array.from({ length: 9 }, (_, i) => ({ course_id: i + 1, faculty_id: i + 1, division_batch: 'A' }))
};
r = run(packing);
assert.equal(r.stage, 'FEASIBILITY', r.errors.join('\n'));
assert.ok(r.errors.some(e => /cannot be packed/.test(e)));

// 8. Fixed sessions are honoured; clashing fixed sessions are reported.
const fixed = college();
fixed.fixedAssignments = [{ course_id: 10, division_id: 1, occurrence: 1, day: 'TUE', start: '09:00' }];
r = run(fixed);
assert.equal(r.success, true, r.errors.join('\n'));
assert.equal(r.assignments.get('10-1-FULL-1').day, 'TUE');
assert.equal(r.assignments.get('10-1-FULL-1').start, '09:00');
fixed.fixedAssignments.push({ course_id: 11, division_id: 1, occurrence: 1, day: 'TUE', start: '09:00' });
r = run(fixed);
assert.equal(r.stage, 'FEASIBILITY'); assert.ok(r.errors.some(e => /Fixed sessions/.test(e)));

// 9. Team teaching, hour limits, room capacity and 3 batches.
const rich = college();
rich.courses[2].faculty_per_session = 2;
rich.courseFaculty.push({ course_id: 20, faculty_id: 2, division_batch: 'A, B' }, { course_id: 20, faculty_id: 4, division_batch: 'B3' });
rich.faculty.forEach(f => { f.max_hours_per_day = 4; });
rich.divisions.forEach(d => { d.student_count = 60; d.batch_count = 3; });
rich.rooms.push({ room_id: 'L3', room_type: 'Lab', capacity: 25 });
rich.rooms.forEach(x => { if (x.room_type === 'Classroom') x.capacity = 65; });
r = run(rich);
assert.equal(r.success, true, r.errors.join('\n'));
assert.ok(r.timetable.filter(x => x.courseType === 'LAB').every(x => x.facultyIds.length === 2));
assert.deepEqual([...new Set(r.sessions.filter(s => s.isLab).map(s => s.batch))].sort(), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);

// 10. The legacy backtracking API also has a time limit.
const graph = new Map([['a', [{ sessionId: 'b', reasons: ['FACULTY'] }]], ['b', [{ sessionId: 'a', reasons: ['FACULTY'] }]]]);
const domains = new Map([['a', ['S1']], ['b', ['S1']]]);
assert.equal(backtracking(graph, domains, new Map(), { timeLimitMs: 1000 }), null);
assert.equal(backtracking.lastRun.status, 'EXHAUSTED');

console.log('Robustness tests passed: valid data solved and audited; impossible data explained instantly.');
