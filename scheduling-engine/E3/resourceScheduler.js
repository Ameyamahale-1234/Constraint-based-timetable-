const { generateSessions } = require('./sessionGenerator');
const { getCollegeSlots, getConsecutiveSlotGroups, getLabWindowSlots, getLabWindowGroups } = require('./collegeTimeConfig');
const { forwardChecking, hasConstraintConflict } = require('./forwardChecking');
const { getResourceConflicts } = require('./graphBuilder');
const { validateTimetable } = require('./timetableValidator');

function normalizeAvailability(rows, resourceKey) {
  if (!rows || !rows.length) return null;
  const result = {};
  for (const row of rows) {
    const id = row[resourceKey] ?? row.resourceId ?? row.id;
    if (id == null) continue;
    const slot = row.slot ?? row.timeSlot ?? row;
    (result[id] ||= []).push(slot);
  }
  return result;
}

function slotKey(slot) {
  return slot && typeof slot === 'object' ? `${slot.day}-${slot.slotId}` : String(slot);
}
function asSlots(value) { return Array.isArray(value) ? value : [value]; }
function availableFor(candidateSlots, availability, id) {
  if (!availability) return true;
  const allowed = availability[id];
  if (!allowed) return false;
  const keys = new Set(allowed.map(slotKey));
  return asSlots(candidateSlots).every(slot => keys.has(slotKey(slot)));
}
function roomMatches(room, required) {
  const type = String(room.roomType ?? room.room_type ?? '').toUpperCase();
  if (required === 'LAB') return type.includes('LAB');
  return type.includes('CLASS') || type.includes('LECTURE') || type === 'ROOM';
}
function candidateSlots(session, slots, labSlots = []) {
  const duration = Number(session.durationHours || 1);
  if (session.isLab || String(session.courseType || session.type).toUpperCase() === 'LAB') {
    return getLabWindowGroups(labSlots, duration);
  }
  if (duration === 1) return slots.filter(slot => slot.type !== 'SPECIAL_LAB' && slot.type !== 'LAB_WINDOW').map(slot => [slot]);
  return getConsecutiveSlotGroups(slots.filter(slot => slot.type !== 'SPECIAL_LAB' && slot.type !== 'LAB_WINDOW'), duration);
}
function buildResourceGraph(sessions, facultyOptions, roomOptions) {
  const graph = new Map(sessions.map(s => [s.id, []]));
  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
    const a = sessions[i], b = sessions[j];
    const reasons = getResourceConflicts(a, b).filter(x => x !== 'FACULTY' && x !== 'ROOM' && x !== 'DAY_SEPARATION');
    if ((facultyOptions.get(a.id) || []).some(x => (facultyOptions.get(b.id) || []).includes(x))) reasons.push('FACULTY');
    if ((roomOptions.get(a.id) || []).some(x => (roomOptions.get(b.id) || []).includes(x))) reasons.push('ROOM');
    if (a.distinctDayGroup && a.distinctDayGroup === b.distinctDayGroup) reasons.push('DAY_SEPARATION');
    if (reasons.length) {
      graph.get(a.id).push({ sessionId: b.id, reasons });
      graph.get(b.id).push({ sessionId: a.id, reasons });
    }
  }
  return graph;
}
function candidateConflict(edge, a, b) {
  return hasConstraintConflict(edge, a, b);
}
function solveResourceCsp(graph, domains) {
  function solve(current, assignments) {
    if (assignments.size === domains.size) return new Map(assignments);
    const remaining = [...current.keys()].filter(id => !assignments.has(id));
    remaining.sort((a, b) => (current.get(a).length - current.get(b).length) ||
      (graph.get(b).length - graph.get(a).length));
    const id = remaining[0];
    for (const candidate of current.get(id) || []) {
      let conflict = false;
      for (const edge of graph.get(id) || []) {
        const other = assignments.get(edge.sessionId);
        if (other && candidateConflict(edge, candidate, other)) { conflict = true; break; }
      }
      if (conflict) continue;
      const nextAssignments = new Map(assignments);
      nextAssignments.set(id, candidate);
      const pruned = forwardChecking(graph, current, id, candidate, nextAssignments);
      if (!pruned.success) continue;
      const result = solve(pruned.domains, nextAssignments);
      if (result) return result;
    }
    return null;
  }
  return solve(domains, new Map());
}

/** Full source-independent generation path: choose faculty, room and time together. */
function generateTimetableFromData(data, options = {}) {
  const sessions = generateSessions(data, options);
  const slots = options.availableSlots || getCollegeSlots(options.timeConfig);
  const labSlots = options.labSlots || getLabWindowSlots(options.labWindow || {});
  const validationSlots = [...slots, ...labSlots];
  const facultyAvailability = options.facultyAvailability || normalizeAvailability(data.facultyAvailability, 'facultyId');
  const roomAvailability = options.roomAvailability || normalizeAvailability(data.roomAvailability, 'roomId');
  const facultyById = new Map((data.faculty || []).map(f => [String(f.facultyId ?? f.faculty_id), f]));
  const rooms = data.rooms || [];
  const facultyOptions = new Map();
  const roomOptions = new Map();
  const domains = new Map();
  const errors = [];

  for (const session of sessions) {
    const eligible = (session.eligibleFacultyIds || []).filter(id => id != null && facultyById.has(String(id)));
    const matchingRooms = rooms.filter(room => roomMatches(room, session.requiresRoomType) && (room.roomId ?? room.room_id) != null);
    facultyOptions.set(session.id, eligible);
    roomOptions.set(session.id, matchingRooms.map(r => r.roomId ?? r.room_id));
    if (!eligible.length) errors.push(`${session.id}: No eligible faculty available`);
    if (!matchingRooms.length) errors.push(`${session.id}: No suitable room available`);
    const times = candidateSlots(session, slots, labSlots);
    const candidates = [];
    for (const facultyId of eligible) for (const room of matchingRooms) for (const group of times) {
      if (!availableFor(group, facultyAvailability, facultyId) || !availableFor(group, roomAvailability, room.roomId ?? room.room_id)) continue;
      candidates.push({ slots: group, facultyId, roomId: room.roomId ?? room.room_id });
    }
    domains.set(session.id, candidates);
    if (!candidates.length) errors.push(`${session.id}: No valid faculty-room-time combination`);
  }
  if (errors.length) return { success: false, method: 'ResourceBacktracking', sessions, assignments: null, errors, domains };

  const graph = buildResourceGraph(sessions, facultyOptions, roomOptions);
  const assignments = solveResourceCsp(graph, domains);
  if (!assignments) return { success: false, method: 'ResourceBacktracking', sessions, assignments: null, errors: ['No conflict-free combination of faculty, room and time slots exists'], domains };

  const validation = validateTimetable(sessions, assignments, { availableSlots: validationSlots });
  const resourceErrors = [];
  for (const session of sessions) {
    const assigned = assignments.get(session.id);
    if (assigned?.facultyId == null || assigned?.roomId == null) resourceErrors.push(`${session.id}: Faculty or room assignment missing`);
  }
  const allErrors = [...validation.errors, ...resourceErrors];
  return { success: allErrors.length === 0, method: 'ResourceBacktracking', sessions, assignments, errors: allErrors, validation, domains };
}

module.exports = { generateTimetableFromData, buildResourceGraph, solveResourceCsp, candidateSlots };
