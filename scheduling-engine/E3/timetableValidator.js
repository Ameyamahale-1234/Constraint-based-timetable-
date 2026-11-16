const { hasOverlap } = require('./forwardChecking');
const { getResourceConflicts } = require('./graphBuilder');

function asSlots(value) { if (value && !Array.isArray(value) && Array.isArray(value.slots)) return value.slots; return Array.isArray(value) ? value : [value]; }
function key(slot) { return slot && typeof slot === 'object' ? `${slot.day}-${slot.slotId}` : String(slot); }
function validateTimetable(sessions, assignments, options = {}) {
  const errors = [];
  const availableSlots = options.availableSlots || null;
  const validKeys = availableSlots ? new Set(availableSlots.map(key)) : null;
  const sessionById = new Map(sessions.map(s => [s.id, s]));

  for (const session of sessions) {
    const assignment = assignments?.get(session.id);
    if (assignment === undefined || assignment === null) {
      errors.push(`Missing assignment for ${session.id}`);
      continue;
    }
    const assignedSlots = asSlots(assignment);
    if (validKeys) for (const slot of assignedSlots) if (!validKeys.has(key(slot))) errors.push(`${session.id}: Assignment contains a slot outside the configured college timetable (${key(slot)})`);
    if (session.durationHours != null && assignedSlots.every(s => s && typeof s === 'object' && Number.isFinite(s.durationMinutes))) {
      const totalMinutes = assignedSlots.reduce((sum, s) => sum + s.durationMinutes, 0);
      const expected = Number(session.durationHours || 1) * 60;
      if (totalMinutes !== expected) errors.push(`${session.id}: Assigned duration is ${totalMinutes} minutes; expected ${expected} minutes`);
      const sorted = [...assignedSlots].sort((a, b) => a.startMinutes - b.startMinutes);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].day !== sorted[i].day || sorted[i - 1].endMinutes !== sorted[i].startMinutes) {
          errors.push(`${session.id}: Multi-period assignment is not uninterrupted or crosses a break`);
          break;
        }
      }
    }
  }

  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
    const s1 = sessions[i], s2 = sessions[j];
    const a = assignments?.get(s1.id), b = assignments?.get(s2.id);
    if (a == null || b == null) continue;
    if (hasOverlap(a, b)) {
      if (a?.facultyId != null && a.facultyId === b?.facultyId) errors.push(`${s1.id} and ${s2.id}: Faculty conflict`);
      if (a?.roomId != null && a.roomId === b?.roomId) errors.push(`${s1.id} and ${s2.id}: Room conflict`);
    }
    if (s1.distinctDayGroup && s1.distinctDayGroup === s2.distinctDayGroup) {
      const daysA = new Set(asSlots(a).filter(x => x && typeof x === 'object').map(x => x.day));
      const daysB = new Set(asSlots(b).filter(x => x && typeof x === 'object').map(x => x.day));
      if ([...daysA].some(day => daysB.has(day))) errors.push(`${s1.id} and ${s2.id}: Sessions required on different days are assigned on the same day`);
    }
    if (!hasOverlap(a, b)) continue;
    for (const conflict of getResourceConflicts(s1, s2)) {
      const labels = { FACULTY: 'Faculty conflict', ROOM: 'Room conflict', DIVISION: 'Full-division conflict', BATCH: 'Laboratory batch conflict' };
      errors.push(`${s1.id} and ${s2.id}: ${labels[conflict] || conflict}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { validateTimetable };
