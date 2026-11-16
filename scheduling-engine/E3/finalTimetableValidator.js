const { validateTimetable } = require('./timetableValidator');
const { getResourceConflicts } = require('./graphBuilder');
const { timeToMinutes, DEFAULT_CONFIG } = require('./collegeTimeConfig');

function slotsOf(assignment) {
  if (assignment && !Array.isArray(assignment) && Array.isArray(assignment.slots)) return assignment.slots;
  return Array.isArray(assignment) ? assignment : assignment == null ? [] : [assignment];
}
function isLab(session) {
  return session.isLab === true || String(session.courseType || session.type || '').toUpperCase().includes('LAB');
}
function overlaps(a, b) {
  return a.day === b.day && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/** Independent final audit of a generated timetable. */
function validateFinalTimetable(sessions, assignments, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.timeConfig || {}) };
  const labWindow = options.labWindow || { start: '08:00', end: '12:00' };
  const labStart = timeToMinutes(labWindow.start || '08:00');
  const labEnd = timeToMinutes(labWindow.end || '12:00');
  const availableSlots = options.availableSlots || [];
  const validSlotKeys = new Set(availableSlots.map(s => `${s.day}-${s.slotId}`));
  const errors = [];
  const counts = { faculty: 0, room: 0, division: 0, batch: 0, missing: 0, time: 0, duration: 0, labWindow: 0 };
  const assignedIds = new Set();

  for (const session of sessions) {
    const assignment = assignments?.get(session.id);
    if (assignment == null) {
      counts.missing++;
      errors.push(`MISSING_ASSIGNMENT: ${session.id} has no assignment`);
      continue;
    }
    assignedIds.add(session.id);
    const assignedSlots = slotsOf(assignment);
    if (!assignedSlots.length) {
      counts.missing++;
      errors.push(`MISSING_SLOT: ${session.id} has no assigned time slots`);
      continue;
    }
    if (assignment.facultyId == null) {
      counts.missing++;
      errors.push(`MISSING_FACULTY: ${session.id} has no faculty assignment`);
    }
    if (assignment.roomId == null) {
      counts.missing++;
      errors.push(`MISSING_ROOM: ${session.id} has no room assignment`);
    }

    const normalized = [...assignedSlots].sort((a, b) => a.startMinutes - b.startMinutes);
    const totalMinutes = normalized.reduce((sum, slot) => sum + (Number(slot.durationMinutes) || 0), 0);
    const expectedMinutes = Number(session.durationHours || 1) * 60;
    if (totalMinutes !== expectedMinutes) {
      counts.duration++;
      errors.push(`DURATION: ${session.id} has ${totalMinutes} assigned minutes; expected ${expectedMinutes}`);
    }
    for (let i = 0; i < normalized.length; i++) {
      const slot = normalized[i];
      if (!slot || !Number.isFinite(slot.startMinutes) || !Number.isFinite(slot.endMinutes) || !slot.day) {
        counts.time++;
        errors.push(`INVALID_SLOT: ${session.id} contains an invalid time slot`);
        continue;
      }
      if (isLab(session)) {
        if (slot.startMinutes < labStart || slot.endMinutes > labEnd) {
          counts.labWindow++;
          errors.push(`LAB_WINDOW: ${session.id} is outside ${labWindow.start || '08:00'}-${labWindow.end || '12:00'}`);
        }
      } else {
        const key = `${slot.day}-${slot.slotId}`;
        if (validSlotKeys.size && !validSlotKeys.has(key)) {
          counts.time++;
          errors.push(`COLLEGE_SLOT: ${session.id} uses a non-class timetable slot (${key})`);
        }
        const lunch = config.lunch;
        if (lunch && overlaps(slot, { day: slot.day, startMinutes: timeToMinutes(lunch.start), endMinutes: timeToMinutes(lunch.end) })) {
          counts.time++;
          errors.push(`LUNCH: ${session.id} overlaps the lunch break`);
        }
      }
      if (i > 0 && (normalized[i - 1].day !== slot.day || normalized[i - 1].endMinutes !== slot.startMinutes)) {
        counts.time++;
        errors.push(`CONTIGUITY: ${session.id} is interrupted by a break or spans different days`);
      }
    }
    if (isLab(session) && ![1, 2, 3].includes(Number(session.durationHours))) {
      counts.duration++;
      errors.push(`LAB_DURATION: ${session.id} has unsupported ${session.durationHours}-hour lab duration`);
    }
  }

  // Check pairwise resource and student-group collisions independently of solver pruning.
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const aSession = sessions[i], bSession = sessions[j];
      const a = assignments?.get(aSession.id), b = assignments?.get(bSession.id);
      if (!a || !b) continue;
      const aSlots = slotsOf(a), bSlots = slotsOf(b);
      const overlapsInTime = aSlots.some(x => bSlots.some(y => x && y && overlaps(x, y)));
      if (!overlapsInTime) continue;
      if (a.facultyId != null && a.facultyId === b.facultyId) {
        counts.faculty++; errors.push(`FACULTY_CONFLICT: ${aSession.id} and ${bSession.id}`);
      }
      if (a.roomId != null && a.roomId === b.roomId) {
        counts.room++; errors.push(`ROOM_CONFLICT: ${aSession.id} and ${bSession.id}`);
      }
      const conflicts = getResourceConflicts(aSession, bSession);
      if (conflicts.includes('DIVISION')) {
        counts.division++; errors.push(`DIVISION_CONFLICT: ${aSession.id} and ${bSession.id}`);
      }
      if (conflicts.includes('BATCH')) {
        counts.batch++; errors.push(`BATCH_CONFLICT: ${aSession.id} and ${bSession.id}`);
      }
    }
  }

  // Retain the existing validator's checks (including duration and distinct-day constraints).
  const base = validateTimetable(sessions, assignments, { availableSlots: options.allAvailableSlots || availableSlots });
  for (const error of base.errors) {
    if (!errors.includes(`BASE_VALIDATION: ${error}`)) errors.push(`BASE_VALIDATION: ${error}`);
  }
  const assignedCount = assignedIds.size;
  const report = {
    valid: errors.length === 0 && assignedCount === sessions.length,
    totalSessions: sessions.length,
    assignedSessions: assignedCount,
    unassignedSessions: sessions.length - assignedCount,
    totalErrors: errors.length,
    conflicts: { faculty: counts.faculty, room: counts.room, division: counts.division, batch: counts.batch },
    ruleViolations: { missingAssignmentsOrResources: counts.missing, time: counts.time, duration: counts.duration, labWindow: counts.labWindow },
    errors
  };
  return report;
}

module.exports = { validateFinalTimetable, slotsOf };
