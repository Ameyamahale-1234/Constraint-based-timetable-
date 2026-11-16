const assert = require('node:assert/strict');
const { normalizeData, validateNormalizedData, LAB_DURATION_BY_CREDIT } = require('../data/dataNormalizer');
const { generateSessions } = require('../sessionGenerator');

assert.deepEqual(LAB_DURATION_BY_CREDIT, { 1: 1, 1.5: 2, 2: 2, 3: 3 });
const normalized = normalizeData({
  faculty: [{ faculty_id: 'F1', faculty_name: 'Faculty 1' }, { faculty_id: 'F2', faculty_name: 'Faculty 2' }],
  courses: [
    { course_id: 'T1', course_name: 'Theory 1', course_type: 'Theory', credits: 1 },
    { course_id: 'T2', course_name: 'Theory 2', course_type: 'Theory', credits: 2 },
    { course_id: 'T3', course_name: 'Theory 3', course_type: 'Theory', credits: 3 },
    { course_id: 'T4', course_name: 'Theory 4', course_type: 'Theory', credits: 4 },
    { course_id: 'L1', course_name: 'Lab 1', course_type: 'Lab', credits: 1 },
    { course_id: 'L15', course_name: 'Lab 1.5', course_type: 'Lab', credits: 1.5 },
    { course_id: 'L2', course_name: 'Lab 2', course_type: 'Lab', credits: 2 },
    { course_id: 'L3', course_name: 'Lab 3', course_type: 'Lab', credits: 3 }
  ],
  divisions: [{ division_id: 'D1', division_name: 'A' }],
  rooms: [{ room_id: 'R1', room_name: 'LAB1', room_type: 'Lab' }],
  courseFaculty: [
    ...['T1','T2','T3','T4','L1','L15','L2','L3'].map(course_id => ({ course_id, faculty_id: 'F1', division_batch: 'A' }))
  ],
  courseDivision: ['T1','T2','T3','T4','L1','L15','L2','L3'].map(course_id => ({ course_id, division_id: 'D1' }))
});
assert.equal(validateNormalizedData(normalized).valid, true);
const sessions = generateSessions(normalized);
const byCourse = course => sessions.filter(s => s.courseId === course);
assert.equal(byCourse('T1').length, 1);
assert.equal(byCourse('T2').length, 2);
assert.equal(byCourse('T3').length, 3);
assert.equal(byCourse('T4').length, 4);
for (const course of ['T1','T2','T3','T4']) assert.ok(byCourse(course).every(s => s.durationHours === 1));
for (const [course, duration] of [['L1',1],['L15',2],['L2',2],['L3',3]]) {
  assert.equal(byCourse(course).length, 2, `${course} must produce A1 and A2 sessions`);
  assert.deepEqual(byCourse(course).map(s => s.batch).sort(), ['A1','A2']);
  assert.ok(byCourse(course).every(s => s.durationHours === duration));
}
const invalid = normalizeData({ courses: [{ course_id: 'L4', course_name: 'Old four-hour lab', course_type: 'Lab', credits: 4 }] });
assert.equal(validateNormalizedData(invalid).valid, false);
assert.throws(() => generateSessions({ ...normalized, courses: invalid.courses, courseDivision: [{ course_id: 'L4', division_id: 'D1' }] }), /unsupported lab credit\/duration mapping/);
console.log('Credit-based session generation tests passed.');
