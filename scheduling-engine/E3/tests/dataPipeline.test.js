const assert = require('node:assert/strict');
const { normalizeData, validateNormalizedData } = require('../data/dataNormalizer');
const { generateSessions } = require('../sessionGenerator');
const normalized = normalizeData({
  faculty: [{ faculty_id: 'F1', faculty_name: 'Faculty 1' }],
  courses: [
    { course_id: 'T3', course_name: 'Theory 3', course_type: 'Theory', credits: 3 },
    { course_id: 'T4', course_name: 'Theory 4', course_type: 'Theory', credits: 4 },
    { course_id: 'L1', course_name: 'Lab 1', course_type: 'Lab', credits: 1 },
    { course_id: 'L15', course_name: 'Lab 1.5', course_type: 'Lab', credits: 1.5 },
    { course_id: 'L2', course_name: 'Lab 2', course_type: 'Lab', credits: 2 }
  ],
  divisions: [{ division_id: 'D1', division_name: 'A' }],
  rooms: [{ room_id: 'R1', room_name: 'LAB1', room_type: 'Lab' }],
  courseFaculty: [],
  courseDivision: ['T3','T4','L1','L15','L2'].map(course_id => ({ course_id, division_id: 'D1' }))
});
assert.equal(validateNormalizedData(normalized).valid, true);
const sessions = generateSessions(normalized);
const count = course => sessions.filter(s => s.courseId === course).length;
assert.equal(count('T3'), 3);
assert.equal(count('T4'), 2);
assert.equal(sessions.find(s => s.courseId === 'T4').durationHours, 2);
assert.equal(sessions.find(s => s.courseId === 'L1').durationHours, 1);
assert.equal(sessions.find(s => s.courseId === 'L15').durationHours, 2);
assert.equal(sessions.find(s => s.courseId === 'L2').durationHours, 4);
console.log('Data normalization and session generation tests passed.');
