const assert = require('node:assert/strict');
const { normalizeData } = require('../data/dataNormalizer');
const { generateSessions } = require('../sessionGenerator');

// Deliberately include misleading sample timetable assignments. The generator
// must use academic master data and credits only, never copy these assignments.
const raw = {
  faculty: [{ faculty_id: 'F1', faculty_name: 'Faculty One' }],
  courses: [{ course_id: 'C1', course_name: 'Algorithms', course_type: 'Theory', credits: 3 }],
  divisions: [{ division_id: 'D1', division_name: 'A' }],
  rooms: [{ room_id: 'R1', room_name: 'Classroom', room_type: 'Classroom' }],
  courseFaculty: [{ course_id: 'C1', faculty_id: 'F1', division_batch: 'A' }],
  courseDivision: [{ course_id: 'C1', division_id: 'D1' }],
  Timetable: [
    { tt_id: 'OLD-001', course_id: 'C1', day: 'MON', slot_id: 999, room_id: 'WRONG' },
    { tt_id: 'OLD-002', course_id: 'C1', day: 'TUE', slot_id: 998, room_id: 'WRONG' }
  ]
};
const sessions = generateSessions(normalizeData(raw));
assert.equal(sessions.length, 3);
assert.ok(sessions.every(session => session.durationHours === 1));
assert.ok(sessions.every(session => !String(session.id).startsWith('OLD-')));
assert.ok(sessions.every(session => session.day == null && session.roomId == null));
console.log('Fresh-session generation test passed: source timetable rows were ignored.');
