const assert = require('node:assert/strict');
const { generateTimetableFromData } = require('../resourceScheduler');

const slots = [
  { slotId: 1, day: 'MON', start: '08:00', end: '09:00', startMinutes: 480, endMinutes: 540, durationMinutes: 60, type: 'CLASS' },
  { slotId: 2, day: 'MON', start: '09:00', end: '10:00', startMinutes: 540, endMinutes: 600, durationMinutes: 60, type: 'CLASS' },
  { slotId: 3, day: 'TUE', start: '08:00', end: '09:00', startMinutes: 480, endMinutes: 540, durationMinutes: 60, type: 'CLASS' },
  { slotId: 4, day: 'TUE', start: '09:00', end: '10:00', startMinutes: 540, endMinutes: 600, durationMinutes: 60, type: 'CLASS' },
  { slotId: 5, day: 'WED', start: '08:00', end: '09:00', startMinutes: 480, endMinutes: 540, durationMinutes: 60, type: 'CLASS' },
  { slotId: 6, day: 'WED', start: '09:00', end: '10:00', startMinutes: 540, endMinutes: 600, durationMinutes: 60, type: 'CLASS' },
  { slotId: 7, day: 'THU', start: '08:00', end: '09:00', startMinutes: 480, endMinutes: 540, durationMinutes: 60, type: 'CLASS' },
  { slotId: 8, day: 'THU', start: '09:00', end: '10:00', startMinutes: 540, endMinutes: 600, durationMinutes: 60, type: 'CLASS' },
  { slotId: 9, day: 'FRI', start: '08:00', end: '09:00', startMinutes: 480, endMinutes: 540, durationMinutes: 60, type: 'CLASS' },
  { slotId: 10, day: 'FRI', start: '09:00', end: '10:00', startMinutes: 540, endMinutes: 600, durationMinutes: 60, type: 'CLASS' },
  { slotId: 11, day: 'MON', start: '10:15', end: '11:15', startMinutes: 615, endMinutes: 675, durationMinutes: 60, type: 'CLASS' },
  { slotId: 12, day: 'MON', start: '11:15', end: '12:15', startMinutes: 675, endMinutes: 735, durationMinutes: 60, type: 'CLASS' },
  { slotId: 'LAB4', day: 'FRI', start: '08:00', end: '12:00', startMinutes: 480, endMinutes: 720, durationMinutes: 240, type: 'SPECIAL_LAB' }
];
const base = {
  faculty: [{ facultyId: 'F1' }, { facultyId: 'F2' }],
  divisions: [{ divisionId: 'D1', divisionName: 'A' }],
  rooms: [{ roomId: 'R1', roomType: 'CLASSROOM' }, { roomId: 'R2', roomType: 'CLASSROOM' }, { roomId: 'LAB1', roomType: 'LAB' }],
  courseFaculty: [], courseDivision: []
};

// Three-credit theory: each generated session receives a real faculty, room and slot.
const theoryData = {
  ...base,
  courses: [{ courseId: 'C1', courseName: 'Algorithms', courseType: 'THEORY', credits: 3 }],
  courseFaculty: [{ courseId: 'C1', facultyId: 'F1', division_batch: 'A' }, { courseId: 'C1', facultyId: 'F2', division_batch: 'A' }],
  courseDivision: [{ courseId: 'C1', divisionId: 'D1' }]
};
const theory = generateTimetableFromData(theoryData, { availableSlots: slots });
assert.equal(theory.success, true, JSON.stringify(theory.errors));
assert.equal(theory.assignments.size, 3);
for (const [id, a] of theory.assignments) {
  assert.ok(a.facultyId != null, `${id} must have faculty`);
  assert.ok(a.roomId != null, `${id} must have room`);
  assert.ok(a.slots.length === 1, `${id} must have a one-hour slot`);
}

// Four-credit theory: four one-hour sessions, each on a different day.
const fourCreditData = {
  ...base,
  courses: [{ courseId: 'C4', courseName: 'Networks', courseType: 'THEORY', credits: 4 }],
  courseFaculty: [{ courseId: 'C4', facultyId: 'F1', division_batch: 'A' }],
  courseDivision: [{ courseId: 'C4', divisionId: 'D1' }]
};
const fourCredit = generateTimetableFromData(fourCreditData, { availableSlots: slots });
assert.equal(fourCredit.success, true, JSON.stringify(fourCredit.errors));
const fourSessions = [...fourCredit.assignments.values()];
assert.notEqual(fourSessions[0].slots[0].day, fourSessions[1].slots[0].day);
assert.equal(fourSessions.length, 4);
assert.ok(fourSessions.every(a => a.slots.length === 1));
assert.equal(new Set(fourSessions.map(a => a.slots[0].day)).size, 4);

// A1/A2 labs are separate batches, use a laboratory, and run in the uninterrupted 8 AM-12 PM lab window.
const labData = {
  ...base,
  courses: [{ courseId: 'L1', courseName: 'Programming Lab', courseType: 'LAB', credits: 1.5 }],
  courseFaculty: [{ courseId: 'L1', facultyId: 'F1', division_batch: 'A1' }, { courseId: 'L1', facultyId: 'F2', division_batch: 'A2' }],
  courseDivision: [{ courseId: 'L1', divisionId: 'D1' }]
};
const lab = generateTimetableFromData(labData, { availableSlots: slots });
assert.equal(lab.success, true, JSON.stringify(lab.errors));
assert.equal(lab.assignments.size, 2);
for (const a of lab.assignments.values()) {
  assert.equal(a.roomId, 'LAB1');
  assert.equal(a.slots.length, 2);
  assert.ok(a.slots.every(slot => slot.type === 'LAB_WINDOW'));
  assert.ok(a.slots[0].startMinutes >= 480 && a.slots[a.slots.length - 1].endMinutes <= 720);
}


console.log('Resource assignment, credit-based theory, and A1/A2 lab tests passed.');
