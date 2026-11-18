const { validateTimetable, facultyOf, isLabSession } = require('./timetableValidator');
const { getResourceConflicts } = require('./graphBuilder');
const { timeToMinutes, DEFAULT_CONFIG } = require('./collegeTimeConfig');

function slotsOf(assignment) {
  if (assignment && !Array.isArray(assignment) && Array.isArray(assignment.slots)) return assignment.slots;
  return Array.isArray(assignment) ? assignment : assignment == null ? [] : [assignment];
}
function overlaps(a, b) {
  return a.day === b.day && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}
function idText(value) { return value == null ? null : String(value).trim(); }
function canon(value) { return String(value ?? '').toUpperCase().replace(/\s/g, ''); }

/**
 * Independent final audit of a generated timetable. It re-checks every hard
 * rule from scratch, without trusting anything the solver computed.
 *
 * options:
 *   availableSlots     class periods (theory must use these)
 *   allAvailableSlots  every legal slot (class + lab window + special blocks)
 *   labWindow | labWindows  {start, end, days?} or an array of them
 *   timeConfig         college time configuration (lunch break)
 *   rooms              room records -> room type and capacity are verified
 *   faculty            faculty records -> maximum hours per day / week are verified
 */
function validateFinalTimetable(sessions, assignments, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.timeConfig || {}) };
  let windows = options.labWindows || options.labWindow || { start: '08:00', end: '12:00' };
  if (!Array.isArray(windows)) windows = [windows];
  windows = windows.map(w => ({ start: timeToMinutes(w.start || '08:00'), end: timeToMinutes(w.end || '12:00'), days: w.days || null, label: `${w.start || '08:00'}-${w.end || '12:00'}` }));
  const availableSlots = options.availableSlots || [];
  const validSlotKeys = new Set(availableSlots.map(s => `${s.day}-${s.slotId}`));
  const roomsById = new Map((options.rooms || []).map(r => [idText(r.roomId ?? r.room_id), r]));
  const facultyById = new Map((options.faculty || []).map(f => [idText(f.id ?? f.facultyId ?? f.faculty_id), f]));
  const errors = [];
  const counts = { faculty: 0, room: 0, division: 0, batch: 0, missing: 0, time: 0, duration: 0, labWindow: 0, capacity: 0, workload: 0 };
  const assignedIds = new Set();
  const facultyMinutes = new Map(); // facultyId -> Map(day -> minutes)

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
    const teachers = facultyOf(assignment);
    if (!teachers.length) {
      counts.missing++;
      errors.push(`MISSING_FACULTY: ${session.id} has no faculty assignment`);
    }
    const required = Number(session.facultyPerSession) || 1;
    if (teachers.length && new Set(teachers).size < required) {
      counts.missing++;
      errors.push(`MISSING_FACULTY: ${session.id} needs ${required} teachers but has ${new Set(teachers).size}`);
    }
    if (session.eligibleFacultyIds && teachers.some(t => !session.eligibleFacultyIds.map(idText).includes(t))) {
      counts.missing++;
      errors.push(`INELIGIBLE_FACULTY: ${session.id} is taught by a teacher not mapped to this course/division`);
    }
    if (assignment.roomId == null) {
      counts.missing++;
      errors.push(`MISSING_ROOM: ${session.id} has no room assignment`);
    } else if (roomsById.size) {
      const room = roomsById.get(idText(assignment.roomId));
      const type = canon(room?.roomType ?? room?.room_type);
      const wantsLab = session.requiresRoomType === 'LAB' || (session.requiresRoomType == null && isLabSession(session));
      if (!room) { counts.room++; errors.push(`UNKNOWN_ROOM: ${session.id} uses room ${assignment.roomId}, which is not in the rooms list`); }
      else if (session.requiredRoomType ? type !== canon(session.requiredRoomType) : wantsLab !== type.includes('LAB')) {
        counts.room++; errors.push(`ROOM_TYPE: ${session.id} needs a ${session.requiredRoomType || (wantsLab ? 'lab' : 'classroom')} but room ${assignment.roomId} is "${room.roomType ?? room.room_type}"`);
      } else if (session.studentCount != null && room.capacity != null && Number(room.capacity) < session.studentCount) {
        counts.capacity++; errors.push(`ROOM_CAPACITY: ${session.id} has ${session.studentCount} students but room ${assignment.roomId} seats ${room.capacity}`);
      }
    }

    const normalized = [...assignedSlots].sort((a, b) => a.startMinutes - b.startMinutes);
    const totalMinutes = normalized.reduce((sum, slot) => sum + (Number(slot.durationMinutes) || 0), 0);
    const expectedMinutes = Number(session.durationHours || 1) * 60;
    const theoryByPeriod = !isLabSession(session) && session.durationSlots != null && normalized.length === Number(session.durationSlots);
    if (!theoryByPeriod && totalMinutes !== expectedMinutes) {
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
      if (isLabSession(session)) {
        const special = slot.type === 'SPECIAL_LAB';
        const inWindow = windows.some(w => (!w.days || w.days.includes(slot.day)) && slot.startMinutes >= w.start && slot.endMinutes <= w.end);
        if (!special && !inWindow) {
          counts.labWindow++;
          errors.push(`LAB_WINDOW: ${session.id} is outside ${windows.map(w => w.label).join(' / ')}`);
        }
      } else {
        const key = `${slot.day}-${slot.slotId}`;
        if (validSlotKeys.size && !validSlotKeys.has(key)) {
          counts.time++;
          errors.push(`COLLEGE_SLOT: ${session.id} uses a non-class timetable slot (${key})`);
        }
      }
      const lunch = config.lunch;
      if (lunch && overlaps(slot, { day: slot.day, startMinutes: timeToMinutes(lunch.start), endMinutes: timeToMinutes(lunch.end) })) {
        counts.time++;
        errors.push(`LUNCH: ${session.id} overlaps the lunch break`);
      }
      if (i > 0 && (normalized[i - 1].day !== slot.day || normalized[i - 1].endMinutes !== slot.startMinutes)) {
        counts.time++;
        errors.push(`CONTIGUITY: ${session.id} is interrupted by a break or spans different days`);
      }
      for (const t of new Set(teachers)) {
        if (!facultyMinutes.has(t)) facultyMinutes.set(t, new Map());
        const perDay = facultyMinutes.get(t);
        perDay.set(slot.day, (perDay.get(slot.day) || 0) + (Number(slot.durationMinutes) || 0));
      }
    }
    if (isLabSession(session) && ![1, 2, 3].includes(Number(session.durationHours))) {
      counts.duration++;
      errors.push(`LAB_DURATION: ${session.id} has unsupported ${session.durationHours}-hour lab duration`);
    }
  }

  // Teacher hour limits.
  for (const [id, perDay] of facultyMinutes) {
    const f = facultyById.get(id);
    if (!f) continue;
    const maxDay = Number.isFinite(f.maxDayMinutes) ? f.maxDayMinutes : f.maxHoursPerDay != null ? Number(f.maxHoursPerDay) * 60 : Infinity;
    const maxWeek = Number.isFinite(f.maxWeekMinutes) ? f.maxWeekMinutes : f.maxHoursPerWeek != null ? Number(f.maxHoursPerWeek) * 60 : Infinity;
    for (const [day, minutes] of perDay) if (minutes > maxDay) { counts.workload++; errors.push(`FACULTY_DAILY_LIMIT: teacher ${id} teaches ${minutes / 60} h on ${day}; limit is ${maxDay / 60} h`); }
    const week = [...perDay.values()].reduce((a, b) => a + b, 0);
    if (week > maxWeek) { counts.workload++; errors.push(`FACULTY_WEEKLY_LIMIT: teacher ${id} teaches ${week / 60} h/week; limit is ${maxWeek / 60} h`); }
  }

  // Pairwise resource and student-group collisions (time-interval based).
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const aSession = sessions[i], bSession = sessions[j];
      const a = assignments?.get(aSession.id), b = assignments?.get(bSession.id);
      if (!a || !b) continue;
      const aSlots = slotsOf(a), bSlots = slotsOf(b);
      const overlapsInTime = aSlots.some(x => bSlots.some(y => x && y && overlaps(x, y)));
      if (!overlapsInTime) continue;
      const fb = facultyOf(b);
      if (facultyOf(a).some(id => fb.includes(id))) {
        counts.faculty++; errors.push(`FACULTY_CONFLICT: ${aSession.id} and ${bSession.id}`);
      }
      if (a.roomId != null && idText(a.roomId) === idText(b.roomId)) {
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
  return {
    valid: errors.length === 0 && assignedCount === sessions.length,
    totalSessions: sessions.length,
    assignedSessions: assignedCount,
    unassignedSessions: sessions.length - assignedCount,
    totalErrors: errors.length,
    conflicts: { faculty: counts.faculty, room: counts.room, division: counts.division, batch: counts.batch },
    ruleViolations: {
      missingAssignmentsOrResources: counts.missing, time: counts.time, duration: counts.duration,
      labWindow: counts.labWindow, roomCapacity: counts.capacity, facultyWorkload: counts.workload
    },
    errors
  };
}

module.exports = { validateFinalTimetable, slotsOf };
