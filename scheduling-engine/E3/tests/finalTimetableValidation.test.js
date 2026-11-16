const assert = require('node:assert/strict');
const { validateFinalTimetable } = require('../finalTimetableValidator');

const slot = (slotId, start, end, type = 'CLASS') => ({
  slotId, day: 'MON', start, end,
  startMinutes: start.split(':').map(Number).reduce((h, m) => h * 60 + m),
  endMinutes: end.split(':').map(Number).reduce((h, m) => h * 60 + m),
  durationMinutes: 60, type
});
const sessions = [
  { id: 'T1', courseType: 'THEORY', durationHours: 1, divisionId: 'A', batch: 'A(full)' },
  { id: 'L1', courseType: 'LAB', isLab: true, durationHours: 2, divisionId: 'B', batch: 'A1', batchIds: ['A1'] }
];
const assignments = new Map([
  ['T1', { slots: [slot(1, '08:00', '09:00')], facultyId: 'F1', roomId: 'R1' }],
  ['L1', { slots: [slot('LAB-MON-480', '08:00', '09:00', 'LAB_WINDOW'), slot('LAB-MON-540', '09:00', '10:00', 'LAB_WINDOW')], facultyId: 'F2', roomId: 'LAB1' }]
]);
const valid = validateFinalTimetable(sessions, assignments, {
  availableSlots: [slot(1, '08:00', '09:00')],
  allAvailableSlots: [slot(1, '08:00', '09:00'), ...assignments.get('L1').slots]
});
assert.equal(valid.valid, true, valid.errors.join('\n'));
assert.equal(valid.assignedSessions, 2);

const invalidAssignments = new Map(assignments);
invalidAssignments.set('L1', { slots: [slot('LAB-MON-480', '08:00', '09:00', 'LAB_WINDOW'), slot('LAB-MON-600', '10:00', '11:00', 'LAB_WINDOW')], facultyId: 'F1', roomId: 'R1' });
const invalid = validateFinalTimetable(sessions, invalidAssignments, {
  availableSlots: [slot(1, '08:00', '09:00')],
  allAvailableSlots: [slot(1, '08:00', '09:00'), ...invalidAssignments.get('L1').slots]
});
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.some(e => e.startsWith('CONTIGUITY:')));
assert.ok(invalid.errors.some(e => e.startsWith('FACULTY_CONFLICT:')));
assert.ok(invalid.errors.some(e => e.startsWith('ROOM_CONFLICT:')));
console.log('Final timetable audit tests passed (valid schedule accepted; break and resource conflicts detected).');
