const { hasOverlap } = require('./forwardChecking');
const { getResourceConflicts } = require('./graphBuilder');

function asSlots(value) { if (value && !Array.isArray(value) && Array.isArray(value.slots)) return value.slots; return Array.isArray(value) ? value : [value]; }
function key(slot) { return slot && typeof slot === 'object' ? `${slot.day}-${slot.slotId}` : String(slot); }
function idText(value) { return value == null ? null : String(value).trim(); }
/** All teachers of an assignment (supports team teaching), as canonical strings. */
function facultyOf(assignment) {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return [];
  const ids = Array.isArray(assignment.facultyIds) ? assignment.facultyIds : assignment.facultyId != null ? [assignment.facultyId] : [];
  return ids.map(idText).filter(id => id != null);
}
function isLabSession(session) {
  return session.isLab === true || String(session.courseType || session.type || '').toUpperCase().includes('LAB');
}

function validateTimetable(sessions, assignments, options = {}) {
  const errors = [];
  const availableSlots = options.availableSlots || null;
  const validKeys = availableSlots ? new Set(availableSlots.map(key)) : null;

  for (const session of sessions) {
    const assignment = assignments?.get(session.id);
    if (assignment === undefined || assignment === null) {
      errors.push(`Missing assignment for ${session.id}`);
      continue;
    }
    const assignedSlots = asSlots(assignment);
    if (validKeys) for (const slot of assignedSlots) if (!validKeys.has(key(slot))) errors.push(`${session.id}: Assignment contains a slot outside the configured college timetable (${key(slot)})`);
    if (session.durationHours != null && assignedSlots.every(s => s && typeof s === 'object' && Number.isFinite(s.durationMinutes))) {
      // Labs are measured in clock hours; theory is measured in class periods
      // (one period per credit), so colleges with 50- or 55-minute periods work too.
      const theoryByPeriod = !isLabSession(session) && session.durationSlots != null && assignedSlots.length === Number(session.durationSlots);
      const totalMinutes = assignedSlots.reduce((sum, s) => sum + s.durationMinutes, 0);
      const expected = Number(session.durationHours || 1) * 60;
      if (!theoryByPeriod && totalMinutes !== expected) errors.push(`${session.id}: Assigned duration is ${totalMinutes} minutes; expected ${expected} minutes`);
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
    const overlap = hasOverlap(a, b);
    if (overlap) {
      const fb = facultyOf(b);
      if (facultyOf(a).some(id => fb.includes(id))) errors.push(`${s1.id} and ${s2.id}: Faculty conflict`);
      if (a?.roomId != null && idText(a.roomId) === idText(b?.roomId)) errors.push(`${s1.id} and ${s2.id}: Room conflict`);
    }
    if (s1.distinctDayGroup && s1.distinctDayGroup === s2.distinctDayGroup) {
      const daysA = new Set(asSlots(a).filter(x => x && typeof x === 'object').map(x => x.day));
      const daysB = new Set(asSlots(b).filter(x => x && typeof x === 'object').map(x => x.day));
      if ([...daysA].some(day => daysB.has(day))) errors.push(`${s1.id} and ${s2.id}: Sessions required on different days are assigned on the same day`);
    }
    if (!overlap) continue;
    for (const conflict of getResourceConflicts(s1, s2)) {
      if (conflict === 'DAY_SEPARATION') continue; // reported above
      const labels = { FACULTY: 'Faculty conflict', ROOM: 'Room conflict', DIVISION: 'Full-division conflict', BATCH: 'Laboratory batch conflict' };
      errors.push(`${s1.id} and ${s2.id}: ${labels[conflict] || conflict}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { validateTimetable, facultyOf, isLabSession };
