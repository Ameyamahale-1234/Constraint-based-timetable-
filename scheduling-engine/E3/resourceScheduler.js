/**
 * ClassSync E3 - resource-aware timetable generation.
 *
 * Pipeline:
 *   1. normalize + validate input data             (data/dataNormalizer.js)
 *   2. expand courses into weekly sessions         (sessionGenerator.js)
 *   3. build every session's options               (teacher(s) x time block, plus suitable rooms)
 *   4. feasibility pre-checks                      (feasibilityChecker.js) - explains impossible data instantly
 *   5. GREEDY construction: always place the most constrained session next
 *      (fewest options left), in its least-loaded day/time
 *   6. BACKTRACKING with forward checking when greedy gets stuck, with
 *      randomized restarts and a hard time limit
 *   7. independent final audit                     (finalTimetableValidator.js)
 *
 * The result is ALWAYS one of:
 *   - success: true  -> a complete timetable that passed the independent audit
 *   - success: false -> a clear reason (input error, proven impossible, or time limit reached)
 */
const { generateSessions } = require('./sessionGenerator');
const { normalizeData, validateNormalizedData, toId, toBool } = require('./data/dataNormalizer');
const { DAYS, DEFAULT_CONFIG, timeToMinutes, getCollegeSlots, getConsecutiveSlotGroups, getLabWindowSlots, getLabWindowGroups } = require('./collegeTimeConfig');
const { checkFeasibility, mergeIntervals } = require('./feasibilityChecker');
const { validateFinalTimetable } = require('./finalTimetableValidator');
const { planFacultyAssignment, actualChanges } = require('./facultyAutoAssign');

const DEFAULTS = Object.freeze({
  timeLimitMs: 60000,
  availabilityGapToleranceMinutes: 30,
  maxFacultyCombinations: 500,
  seed: 1
});

// ---------------------------------------------------------------- helpers
function canon(value) { return String(value ?? '').toUpperCase().replace(/\s/g, ''); }
function dayCode(value) { return value == null ? null : canon(value).slice(0, 3); }
function slotKey(slot) { return `${slot.day}-${slot.slotId}`; }
function first(row, keys) { for (const k of keys) if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; return null; }
function minutesOf(value) {
  if (value == null || value === '') return null;
  if (Number.isFinite(value)) return value;
  return timeToMinutes(String(value).slice(0, 5));
}
function addInterval(map, day, s, e) { if (!map.has(day)) map.set(day, []); map.get(day).push([s, e]); }
function combinations(items, k, cap) {
  const out = [];
  const pick = (start, chosen) => {
    if (out.length >= cap) return;
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i < items.length; i++) { chosen.push(items[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  return out;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function luby(i) { // 1,1,2,1,1,2,4,1,1,2,...
  let k = 1;
  while ((1 << k) - 1 < i) k++;
  return (1 << k) - 1 === i ? 1 << (k - 1) : luby(i - (1 << (k - 1)) + 1);
}

// ---------------------------------------------------------------- availability
/**
 * Availability is compared by DAY and CLOCK TIME, never by slot ID, so class
 * periods, lab-window hours and special blocks are all checked consistently.
 * Supported row shapes (per teacher or room):
 *   { facultyId, day, start: '09:00', end: '10:00', available?: true|false }
 *   { facultyId, day, slotId }                 (slotId of a college class period)
 *   { facultyId, slot: { day, slotId | start/end | startMinutes/endMinutes } }
 * A resource with available rows may only be used inside them (adjacent periods
 * separated by a short break are merged). `available: false` rows block time.
 * A resource with no rows at all is treated as always available.
 */
function buildAvailability(rows, legacy, idKeys, resolveSlot, tolerance, warnings, label) {
  const result = new Map();
  let unresolved = 0;
  const entry = id => { if (!result.has(id)) result.set(id, { allowed: null, blocked: new Map() }); return result.get(id); };
  const add = (id, slot, available) => {
    if (id == null) return;
    const iv = resolveSlot(slot);
    if (!iv) { unresolved++; return; }
    const e = entry(id);
    if (available === false) addInterval(e.blocked, iv.day, iv.start, iv.end);
    else { if (!e.allowed) e.allowed = new Map(); addInterval(e.allowed, iv.day, iv.start, iv.end); }
  };
  if (legacy && typeof legacy === 'object') for (const [id, slots] of Object.entries(legacy)) for (const slot of [].concat(slots || [])) add(toId(id), slot, true);
  for (const row of rows || []) {
    const id = toId(first(row, idKeys) ?? row.resourceId ?? row.id);
    add(id, row.slot ?? row.timeSlot ?? row, toBool(row.available ?? row.is_available, true));
  }
  for (const e of result.values()) {
    if (!e.allowed) continue;
    for (const [day, list] of e.allowed) {
      const merged = [];
      for (const [s, end] of mergeIntervals(list)) {
        if (merged.length && s - merged[merged.length - 1][1] <= tolerance) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
        else merged.push([s, end]);
      }
      e.allowed.set(day, merged);
    }
  }
  if (unresolved) warnings.push(`${unresolved} ${label} availability row(s) could not be matched to a day and time and were ignored`);
  return result;
}
function isCovered(avail, slots) {
  if (!avail) return true;
  return slots.every(slot => {
    const allowed = avail.allowed ? (avail.allowed.get(slot.day) || []).some(([s, e]) => s <= slot.startMinutes && slot.endMinutes <= e) : true;
    const blocked = (avail.blocked.get(slot.day) || []).some(([s, e]) => s < slot.endMinutes && slot.startMinutes < e);
    return allowed && !blocked;
  });
}

// ---------------------------------------------------------------- room rules
function roomKind(room) {
  const type = canon(room.roomType ?? room.room_type);
  if (type.includes('LAB')) return 'LAB';
  if (/OFFICE|STAFF|STORE|CABIN|WASH|TOILET|PANTRY/.test(type)) return 'OTHER';
  return 'CLASSROOM';
}
function roomMatches(room, session) {
  if (session.requiredRoomType) return canon(room.roomType ?? room.room_type) === canon(session.requiredRoomType);
  return roomKind(room) === session.requiresRoomType;
}

// ---------------------------------------------------------------- model
function buildModel(data, sessions, options, warnings) {
  const tolerance = options.availabilityGapToleranceMinutes ?? DEFAULTS.availabilityGapToleranceMinutes;
  const timeConfig = options.timeConfig || {};
  const allSlots = options.availableSlots || getCollegeSlots(timeConfig);
  const classSlots = allSlots.filter(s => s.type !== 'SPECIAL_LAB' && s.type !== 'LAB_WINDOW');
  const specialSlots = allSlots.filter(s => s.type === 'SPECIAL_LAB');
  const lunch = timeConfig.lunch !== undefined ? timeConfig.lunch : DEFAULT_CONFIG.lunch;
  const lunchStart = lunch ? minutesOf(lunch.start) : null, lunchEnd = lunch ? minutesOf(lunch.end) : null;
  const workingDays = timeConfig.workingDays || DAYS.filter(d => classSlots.some(s => s.day === d));
  let labWindows = options.labWindows || options.labWindow || { start: '08:00', end: '12:00' };
  if (!Array.isArray(labWindows)) labWindows = [labWindows];
  labWindows = labWindows.map(w => ({ start: w.start || '08:00', end: w.end || '12:00', days: w.days || workingDays, periodDurationMinutes: w.periodDurationMinutes || 60 }));
  const labSlots = (options.labSlots || labWindows.flatMap(w => getLabWindowSlots(w)))
    .filter(s => lunchStart == null || !(s.startMinutes < lunchEnd && lunchStart < s.endMinutes));

  // Time units: every distinct period / lab hour / special block.
  const units = [], unitIndex = new Map();
  for (const slot of [...classSlots, ...labSlots, ...specialSlots]) {
    const key = slotKey(slot);
    if (!unitIndex.has(key)) { unitIndex.set(key, units.length); units.push(slot); }
  }
  const U = units.length;
  const overlaps = units.map(a => units.map((b, j) => (a.day === b.day && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes ? j : -1)).filter(j => j >= 0));
  const days = DAYS.filter(d => units.some(u => u.day === d)).concat([...new Set(units.map(u => u.day))].filter(d => !DAYS.includes(d)));
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  // Resolve an availability row into a concrete day + interval.
  const byDaySlot = new Map(classSlots.map(s => [`${s.day}-${s.slotId}`, s]));
  const bySlotId = new Map();
  for (const s of classSlots) bySlotId.set(String(s.slotId), bySlotId.has(String(s.slotId)) ? null : s);
  const resolveSlot = slot => {
    if (!slot || typeof slot !== 'object') return null;
    const day = dayCode(slot.day);
    const sm = slot.startMinutes ?? minutesOf(slot.start ?? slot.start_time ?? slot.startTime);
    const em = slot.endMinutes ?? minutesOf(slot.end ?? slot.end_time ?? slot.endTime);
    if (day && Number.isFinite(sm) && Number.isFinite(em) && em > sm) return { day, start: sm, end: em };
    const id = slot.slotId ?? slot.slot_id;
    if (id == null) return null;
    const found = (day && byDaySlot.get(`${day}-${id}`)) || bySlotId.get(String(id));
    return found ? { day: found.day, start: found.startMinutes, end: found.endMinutes } : null;
  };
  const facultyAvail = buildAvailability(data.facultyAvailability, options.facultyAvailability, ['facultyId', 'faculty_id'], resolveSlot, tolerance, warnings, 'faculty');
  const roomAvail = buildAvailability(data.roomAvailability, options.roomAvailability, ['roomId', 'room_id'], resolveSlot, tolerance, warnings, 'room');

  // Teachers.
  const hoursToMin = h => (h == null || !Number.isFinite(Number(h)) ? Infinity : Number(h) * 60);
  const faculty = (data.faculty || []).filter(f => toId(f.facultyId ?? f.faculty_id) != null).map(f => {
    const id = toId(f.facultyId ?? f.faculty_id);
    return {
      id, name: f.name ?? f.faculty_name ?? null,
      maxDayMinutes: hoursToMin(f.maxHoursPerDay ?? options.maxFacultyHoursPerDay),
      maxWeekMinutes: hoursToMin(f.maxHoursPerWeek ?? options.maxFacultyHoursPerWeek),
      avail: facultyAvail.get(id) || null
    };
  });
  const facIndex = new Map(faculty.map((f, i) => [f.id, i]));
  for (const id of facultyAvail.keys()) if (!facIndex.has(id)) warnings.push(`Availability given for unknown faculty ${id}; ignored`);

  // Rooms.
  const rooms = (data.rooms || []).filter(r => toId(r.roomId ?? r.room_id) != null).map(r => {
    const id = toId(r.roomId ?? r.room_id);
    const capacity = r.capacity != null && Number.isFinite(Number(r.capacity)) ? Number(r.capacity) : null;
    return { id, raw: r, capacity, avail: roomAvail.get(id) || null };
  });

  // Time blocks for each kind of session (cached).
  const timeGroups = new Map();
  let nextTimeId = 0;
  const groupsFor = session => {
    const key = `${session.isLab}|${session.durationHours}`;
    if (!timeGroups.has(key)) {
      let groups;
      if (session.isLab) {
        groups = getLabWindowGroups(labSlots, session.durationHours)
          .concat(specialSlots.filter(s => s.durationMinutes === session.durationHours * 60).map(s => [s]));
      } else if (Number(session.durationHours || 1) === 1) {
        groups = classSlots.map(s => [s]); // one class period per credit
      } else {
        groups = getConsecutiveSlotGroups(classSlots, session.durationHours);
      }
      timeGroups.set(key, groups.map(slots => ({
        tid: nextTimeId++, slots,
        units: slots.map(s => unitIndex.get(slotKey(s))),
        day: dayIndex.get(slots[0].day), dayName: slots[0].day,
        minutes: slots.reduce((sum, s) => sum + s.durationMinutes, 0)
      })));
    }
    return timeGroups.get(key);
  };

  // Fixed (pre-assigned) sessions.
  const fixedBySession = new Map();
  const fixedErrors = [];
  (data.fixedAssignments || []).forEach((row, n) => {
    const courseId = toId(first(row, ['courseId', 'course_id']));
    const divisionId = toId(first(row, ['divisionId', 'division_id']));
    const batch = first(row, ['batch', 'division_batch']);
    const occurrence = first(row, ['occurrence']);
    const match = sessions.find(s => s.courseId === courseId && s.divisionId === divisionId &&
      (batch == null || canon(s.batch) === canon(batch)) && (occurrence == null || s.occurrence === Number(occurrence)) && !fixedBySession.has(s.id));
    if (!match) { fixedErrors.push({ type: 'FIXED_INVALID', message: `Fixed assignment row ${n + 1} (course ${courseId}, division ${divisionId}${batch ? `, batch ${batch}` : ''}) does not match any session that still needs a time` }); return; }
    const start = first(row, ['start', 'start_time', 'startTime']);
    fixedBySession.set(match.id, {
      day: dayCode(first(row, ['day'])),
      start: start != null ? minutesOf(start) : null,
      slotId: toId(first(row, ['slotId', 'slot_id'])),
      facultyId: toId(first(row, ['facultyId', 'faculty_id'])),
      roomId: toId(first(row, ['roomId', 'room_id']))
    });
  });

  // Per-session options.
  const tokenIndex = new Map(), dayGroupIndex = new Map(), facGroupIndex = new Map();
  const indexOf = (map, key) => { if (!map.has(key)) map.set(key, map.size); return map.get(key); };
  const roomAvailCache = new Map();
  const cap = options.maxFacultyCombinations ?? DEFAULTS.maxFacultyCombinations;

  const sessionInfo = sessions.map(session => {
    const fixed = fixedBySession.get(session.id) || null;
    const eligible = [...new Set((session.eligibleFacultyIds || []).map(toId))].filter(id => facIndex.has(id)).map(id => facIndex.get(id));
    const k = Math.max(1, Number(session.facultyPerSession) || 1);
    let facultySets = eligible.length >= k ? combinations(eligible, k, cap) : [];
    if (fixed?.facultyId != null) facultySets = facultySets.filter(set => set.some(f => faculty[f].id === fixed.facultyId));

    let roomList = rooms.map((r, i) => i).filter(i => roomMatches(rooms[i].raw, session));
    const typedCount = roomList.length;
    if (session.studentCount != null) roomList = roomList.filter(i => rooms[i].capacity == null || rooms[i].capacity >= session.studentCount);
    if (fixed?.roomId != null) roomList = roomList.filter(i => rooms[i].id === fixed.roomId);
    const wanted = session.requiredRoomType ? `"${session.requiredRoomType}"` : session.requiresRoomType === 'LAB' ? 'lab' : 'classroom';
    const roomReason = typedCount === 0 ? `there is no ${wanted} room in the rooms list`
      : fixed?.roomId != null ? `fixed room ${fixed.roomId} is not a suitable ${wanted} room`
      : `no ${wanted} room is large enough for ${session.studentCount} students`;

    // Group symmetric rooms (same capacity and availability) so the search tries one per group.
    const classes = new Map();
    for (const i of [...roomList].sort((a, b) => (rooms[a].capacity ?? Infinity) - (rooms[b].capacity ?? Infinity))) {
      const sig = `${rooms[i].capacity}|${rooms[i].avail ? JSON.stringify([...(rooms[i].avail.allowed || new Map())].concat([...rooms[i].avail.blocked])) : '-'}`;
      if (!classes.has(sig)) classes.set(sig, []);
      classes.get(sig).push(i);
    }
    const roomClasses = [...classes.values()];

    let groups = groupsFor(session);
    const timeGroupCount = groups.length;
    let fixedProblem = null;
    if (fixed) {
      groups = groups.filter(g => g.dayName === fixed.day &&
        (fixed.start == null || g.slots[0].startMinutes === fixed.start) &&
        (fixed.slotId == null || String(g.slots[0].slotId) === fixed.slotId));
      if (!groups.length) fixedProblem = `its fixed time (${fixed.day ?? '?'} ${fixed.start != null ? `${Math.floor(fixed.start / 60)}:${String(fixed.start % 60).padStart(2, '0')}` : fixed.slotId ?? ''}) is not a valid start for a ${session.durationHours}-hour ${session.isLab ? 'lab' : 'class'}`;
    }

    const preferred = session.preferredFacultyIds ? new Set(session.preferredFacultyIds.map(toId).filter(id => facIndex.has(id)).map(id => facIndex.get(id))) : null;
    const cands = [];
    for (const g of groups) {
      for (const set of facultySets) {
        if (!set.every(f => isCovered(faculty[f].avail, g.slots) && g.minutes <= faculty[f].maxDayMinutes && g.minutes <= faculty[f].maxWeekMinutes)) continue;
        cands.push({ ...g, fac: set, facKey: set.join(','), order: cands.length, nonPreferred: preferred && preferred.size && set.some(f => !preferred.has(f)) ? 1 : 0 });
      }
    }
    return {
      session, fixed: !!fixed, cands, roomClasses, roomList, roomReason, fixedProblem,
      mappedFaculty: eligible.length, eligibleRooms: roomList.length, timeGroups: timeGroupCount,
      tokens: (session.groupTokens || [session.batchIds?.length ? `${session.divisionId}::${session.batch}` : `${session.divisionId}::*`]).map(t => indexOf(tokenIndex, t)),
      dayGroup: session.distinctDayGroup ? indexOf(dayGroupIndex, session.distinctDayGroup) : -1,
      facGroup: session.sameFacultyGroup ? indexOf(facGroupIndex, session.sameFacultyGroup) : -1
    };
  });

  const roomAvailable = (r, cand) => {
    const key = r * 1e6 + cand.tid;
    if (!roomAvailCache.has(key)) roomAvailCache.set(key, isCovered(rooms[r].avail, cand.slots));
    return roomAvailCache.get(key);
  };
  const timesOverlap = (a, b) => a.units.some(u => overlaps[u].some(v => b.units.includes(v)));

  return {
    sessions, sessionInfo, faculty, rooms, units, U, overlaps, days, D: days.length,
    tokenCount: tokenIndex.size, dayGroupCount: dayGroupIndex.size, facGroupCount: facGroupIndex.size,
    classSlots, labSlots, specialSlots, labWindows, roomAvailable, timesOverlap, fixedErrors
  };
}

// ---------------------------------------------------------------- search
function solve(model, options) {
  const { sessionInfo: S, U, D, overlaps, faculty, rooms } = model;
  const n = S.length, F = faculty.length, R = rooms.length;
  const deadline = Date.now() + (options.timeLimitMs ?? DEFAULTS.timeLimitMs);
  const maxNodes = options.maxNodes ?? Infinity;
  const seed = options.seed ?? DEFAULTS.seed;

  const facBusy = new Int32Array(F * U), roomBusy = new Int32Array(R * U), tokBusy = new Int32Array(model.tokenCount * U);
  const dayUse = new Int32Array(model.dayGroupCount * D);
  const facDayMin = new Float64Array(F * D), facWeekMin = new Float64Array(F), tokDayMin = new Float64Array(model.tokenCount * D);
  const facGroupKey = new Array(model.facGroupCount).fill(null), facGroupCount = new Int32Array(model.facGroupCount);
  const assigned = new Uint8Array(n), cnt = new Int32Array(n);
  const chosen = new Array(n).fill(null);
  const failCount = new Int32Array(n);
  let assignedCount = 0;

  // Timetable quality (soft preferences, never affect correctness):
  //  - a course's weekly classes should not all sit at the same time of day,
  //  - a division's classes should be spread over morning and afternoon,
  //  - students should not get long idle gaps in a day.
  const startList = [...new Set(S.flatMap(info => info.cands.map(c => c.slots[0].startMinutes)))].sort((a, b) => a - b);
  const startIndex = new Map(startList.map((m, k) => [m, k]));
  const SN = startList.length;
  for (const info of S) for (const c of info.cands) {
    c.sIdx = startIndex.get(c.slots[0].startMinutes);
    c.startMin = c.slots[0].startMinutes;
    c.endMin = c.slots[c.slots.length - 1].endMinutes;
  }
  const tokTime = new Int32Array(model.tokenCount * SN), grpTime = new Int32Array(model.dayGroupCount * SN);
  const unitsOfDay = Array.from({ length: D }, () => []);
  model.units.forEach((u, k) => { const d = model.days.indexOf(u.day); if (d >= 0) unitsOfDay[d].push(k); });
  const W = { sameCourseTime: 150, divisionTime: 30, gapPerMinute: 0.6, nonPreferredTeacher: 400, ...(options.preferenceWeights || {}) };
  function gapMinutes(t, c) {
    let best = Infinity;
    for (const v of unitsOfDay[c.day]) {
      if (!tokBusy[t * U + v]) continue;
      const slot = model.units[v];
      const d = Math.max(0, slot.startMinutes - c.endMin, c.startMin - slot.endMinutes);
      if (d < best) best = d;
    }
    return best === Infinity ? 0 : best;
  }

  // Neighbours: sessions whose option counts can change when this one is placed.
  const byFac = new Map(), byTok = new Map(), byDayGroup = new Map(), byFacGroup = new Map();
  const push = (map, key, i) => { if (!map.has(key)) map.set(key, []); map.get(key).push(i); };
  S.forEach((info, i) => {
    new Set(info.cands.flatMap(c => c.fac)).forEach(f => push(byFac, f, i));
    info.tokens.forEach(t => push(byTok, t, i));
    if (info.dayGroup >= 0) push(byDayGroup, info.dayGroup, i);
    if (info.facGroup >= 0) push(byFacGroup, info.facGroup, i);
  });
  const neighbors = S.map((info, i) => {
    const set = new Set();
    new Set(info.cands.flatMap(c => c.fac)).forEach(f => byFac.get(f).forEach(j => set.add(j)));
    info.tokens.forEach(t => byTok.get(t).forEach(j => set.add(j)));
    if (info.dayGroup >= 0) byDayGroup.get(info.dayGroup).forEach(j => set.add(j));
    if (info.facGroup >= 0) byFacGroup.get(info.facGroup).forEach(j => set.add(j));
    set.delete(i);
    return Int32Array.from(set);
  });

  function feasible(info, c) {
    if (info.facGroup >= 0 && facGroupKey[info.facGroup] !== null && facGroupKey[info.facGroup] !== c.facKey) return false;
    if (info.dayGroup >= 0 && dayUse[info.dayGroup * D + c.day] > 0) return false;
    for (const f of c.fac) {
      const base = f * U;
      for (const u of c.units) if (facBusy[base + u]) return false;
      if (facDayMin[f * D + c.day] + c.minutes > faculty[f].maxDayMinutes) return false;
      if (facWeekMin[f] + c.minutes > faculty[f].maxWeekMinutes) return false;
    }
    for (const t of info.tokens) {
      const base = t * U;
      for (const u of c.units) if (tokBusy[base + u]) return false;
    }
    return true;
  }
  function freeRooms(info, c) {
    const out = [];
    for (const cls of info.roomClasses) {
      for (const r of cls) {
        if (!model.roomAvailable(r, c)) continue;
        let free = true;
        for (const u of c.units) if (roomBusy[r * U + u]) { free = false; break; }
        if (free) { out.push(r); break; }
      }
    }
    return out;
  }
  function count(i) { let k = 0; for (const c of S[i].cands) if (feasible(S[i], c)) k++; return k; }
  function mark(i, c, r, delta) {
    const info = S[i];
    for (const u of c.units) for (const v of overlaps[u]) {
      for (const f of c.fac) facBusy[f * U + v] += delta;
      roomBusy[r * U + v] += delta;
      for (const t of info.tokens) tokBusy[t * U + v] += delta;
    }
    for (const f of c.fac) { facDayMin[f * D + c.day] += delta * c.minutes; facWeekMin[f] += delta * c.minutes; }
    for (const t of info.tokens) { tokDayMin[t * D + c.day] += delta * c.minutes; tokTime[t * SN + c.sIdx] += delta; }
    if (info.dayGroup >= 0) grpTime[info.dayGroup * SN + c.sIdx] += delta;
    if (info.dayGroup >= 0) dayUse[info.dayGroup * D + c.day] += delta;
    if (info.facGroup >= 0) {
      facGroupCount[info.facGroup] += delta;
      facGroupKey[info.facGroup] = facGroupCount[info.facGroup] > 0 ? c.facKey : null;
    }
    assigned[i] = delta > 0 ? 1 : 0;
    chosen[i] = delta > 0 ? { c, r } : null;
    assignedCount += delta;
  }

  const stats = { nodes: 0, backtracks: 0, restarts: 0, greedyPlaced: 0, bestPlaced: 0 };
  let best = null;

  // On restarts (the data is hard to fit) the soft preferences are weakened so
  // the search concentrates on finding any valid timetable.
  let quality = 1;
  function run(nodeLimit, rng) {
    facBusy.fill(0); roomBusy.fill(0); tokBusy.fill(0); dayUse.fill(0); facDayMin.fill(0); facWeekMin.fill(0); tokDayMin.fill(0); tokTime.fill(0); grpTime.fill(0);
    facGroupKey.fill(null); facGroupCount.fill(0); assigned.fill(0); chosen.fill(null); assignedCount = 0;
    for (let i = 0; i < n; i++) { cnt[i] = count(i); if (cnt[i] === 0) { failCount[i]++; return 'EXHAUSTED'; } }
    let nodes = 0, backtracked = false;

    // Variable choice = fewest remaining options (MRV), weighted by how often a
    // session has caused dead ends so far (dom/wdeg). Failure weights persist
    // across restarts, so the search learns which sessions to place first.
    const select = () => {
      let bestI = -1, bestCnt = Infinity, bestDeg = -1, bestTie = 0;
      for (let i = 0; i < n; i++) {
        if (assigned[i]) continue;
        const c = cnt[i] / (1 + failCount[i]);
        if (c > bestCnt) continue;
        const deg = neighbors[i].length;
        const tie = rng ? rng() : 0;
        if (c < bestCnt || deg > bestDeg || (deg === bestDeg && tie > bestTie)) { bestI = i; bestCnt = c; bestDeg = deg; bestTie = tie; }
      }
      return bestI;
    };
    const frame = i => {
      const info = S[i], options = [];
      for (const c of info.cands) {
        if (!feasible(info, c)) continue;
        let load = 0, timeUse = 0, gap = 0;
        for (const t of info.tokens) { load += tokDayMin[t * D + c.day]; timeUse += tokTime[t * SN + c.sIdx]; gap += gapMinutes(t, c); }
        load /= info.tokens.length;
        // Labs (once a week) are kept tightly packed so lab rooms are not fragmented;
        // the spreading preferences apply to theory classes.
        if (!info.session.isLab) load += quality * (W.divisionTime * timeUse / info.tokens.length + W.gapPerMinute * gap / info.tokens.length);
        if (info.dayGroup >= 0) load += quality * W.sameCourseTime * grpTime[info.dayGroup * SN + c.sIdx];
        for (const f of c.fac) load += 0.5 * facDayMin[f * D + c.day] + 0.01 * facWeekMin[f];
        load += W.nonPreferredTeacher * c.nonPreferred; // follow the teacher plan when possible
        const score = load + (rng ? rng() * 90 : 0) + c.order * 1e-6;
        for (const r of freeRooms(info, c)) options.push({ c, r, score: score + (rooms[r].capacity ?? 0) * 1e-9 });
      }
      options.sort((a, b) => a.score - b.score);
      return { i, options, pos: 0, applied: false, saved: null };
    };
    const undo = fr => {
      for (let k = fr.saved.length - 1; k >= 0; k--) cnt[fr.saved[k][0]] = fr.saved[k][1];
      const { c, r } = chosen[fr.i];
      mark(fr.i, c, r, -1);
      fr.applied = false;
    };

    const stack = [frame(select())];
    while (stack.length) {
      const fr = stack[stack.length - 1];
      if (fr.applied) { undo(fr); stats.backtracks++; backtracked = true; }
      if (fr.pos >= fr.options.length) { failCount[fr.i]++; stack.pop(); continue; }
      if (++nodes > nodeLimit) { stats.nodes += nodes; return 'LIMIT'; }
      if ((nodes & 127) === 0 && Date.now() > deadline) { stats.nodes += nodes; return 'TIMEOUT'; }
      const opt = fr.options[fr.pos++];
      mark(fr.i, opt.c, opt.r, +1);
      fr.applied = true;
      fr.saved = [];
      let wipeout = -1;
      for (const j of neighbors[fr.i]) {
        if (assigned[j]) continue;
        const now = count(j);
        if (now !== cnt[j]) { fr.saved.push([j, cnt[j]]); cnt[j] = now; }
        if (now === 0) { wipeout = j; break; }
      }
      if (!backtracked) stats.greedyPlaced = Math.max(stats.greedyPlaced, assignedCount);
      if (assignedCount > stats.bestPlaced) { stats.bestPlaced = assignedCount; best = chosen.map(x => x && { ...x }); }
      if (wipeout >= 0) { failCount[wipeout]++; continue; }
      if (assignedCount === n) { stats.nodes += nodes; return 'SOLVED'; }
      stack.push(frame(select()));
    }
    stats.nodes += nodes;
    return 'EXHAUSTED';
  }

  if (n === 0) return { status: 'SOLVED', chosen: [], stats, failCount };
  const base = Math.max(2000, 4 * n);
  let status;
  for (let attempt = 0; ; attempt++) {
    const limit = Math.min(maxNodes, base * luby(attempt + 1));
    quality = attempt === 0 ? 1 : attempt < 3 ? 0.5 : 0.15;
    status = run(limit, attempt === 0 ? null : mulberry32(seed + attempt));
    if (status === 'SOLVED' || status === 'EXHAUSTED' || status === 'TIMEOUT') break;
    if (Date.now() > deadline || stats.nodes >= maxNodes) { status = 'TIMEOUT'; break; }
    stats.restarts++;
  }
  return { status, chosen: status === 'SOLVED' ? chosen : best, stats, failCount };
}

// ---------------------------------------------------------------- output
function toAssignments(model, chosen) {
  const assignments = new Map();
  chosen.forEach((pick, i) => {
    if (!pick) return;
    const { c, r } = pick;
    const facultyIds = c.fac.map(f => model.faculty[f].id);
    assignments.set(model.sessions[i].id, {
      slots: c.slots, day: c.dayName,
      start: c.slots[0].start, end: c.slots[c.slots.length - 1].end,
      facultyId: facultyIds[0], facultyIds, roomId: model.rooms[r].id
    });
  });
  return assignments;
}
function toTimetableRows(sessions, assignments, model) {
  const dayOrder = new Map(model.days.map((d, i) => [d, i]));
  return sessions.filter(s => assignments.has(s.id)).map(s => {
    const a = assignments.get(s.id);
    return {
      sessionId: s.id, courseId: s.courseId, courseName: s.courseName, courseType: s.courseType,
      divisionId: s.divisionId, divisionName: s.divisionName, batch: s.batch,
      day: a.day, start: a.start, end: a.end, facultyIds: a.facultyIds, roomId: a.roomId
    };
  }).sort((x, y) => (dayOrder.get(x.day) - dayOrder.get(y.day)) || x.start.localeCompare(y.start) || String(x.divisionName).localeCompare(String(y.divisionName)));
}
function failure(stage, errors, extra = {}) {
  return { success: false, method: 'GreedyBacktracking', stage, assignments: null, errors, ...extra };
}

/** Full generation path: choose teacher(s), room and time together for every session. */
function generateTimetableFromData(rawData, options = {}) {
  const started = Date.now();
  const warnings = [];
  const data = normalizeData(rawData || {});
  const structural = validateNormalizedData(data);
  warnings.push(...(structural.warnings || []));
  if (!structural.valid) return failure('INPUT_VALIDATION', structural.errors, { sessions: [], warnings });

  let sessions;
  try { sessions = generateSessions(data, options); }
  catch (error) { return failure('SESSION_GENERATION', error.details || [error.message], { sessions: [], warnings }); }

  // Optional automatic teacher reassignment (options.autoAssignFaculty: 'off' | 'course' | 'department' | 'any').
  let teacherPlan = null;
  if (options.autoAssignFaculty && options.autoAssignFaculty !== 'off') {
    const slots = (options.availableSlots || getCollegeSlots(options.timeConfig || {})).filter(x => x.type !== 'SPECIAL_LAB' && x.type !== 'LAB_WINDOW');
    teacherPlan = planFacultyAssignment(data, sessions, {
      ...options,
      weeklyTeachingMinutes: slots.reduce((sum, x) => sum + x.durationMinutes, 0),
      workingDayCount: new Set(slots.map(x => x.day)).size
    });
  }
  const tierBySession = new Map(sessions.filter(x => x.reassignmentTier).map(x => [x.id, x.reassignmentTier]));
  const facultyNames = new Map((data.faculty || []).map(f => [toId(f.facultyId), f.name ?? toId(f.facultyId)]));
  const teacherSummary = () => teacherPlan && {
    mode: teacherPlan.mode,
    shortfall: teacherPlan.shortfall,
    unresolved: teacherPlan.unresolved.map(u => ({ courseName: u.group.sessions[0].courseName, divisionName: u.group.sessions[0].divisionName, batch: u.group.isLab ? u.group.sessions[0].batch : null, reason: u.reason }))
  };
  const shortfallMessage = () => teacherPlan?.shortfall
    ? [`Not enough teaching hours: the timetable needs ${teacherPlan.shortfall.neededHours} teacher-hours per week, but all teachers together can teach only ${teacherPlan.shortfall.availableHours}. Add about ${teacherPlan.shortfall.extraTeachers} more teacher(s) or raise the weekly hour limits.`]
    : [];

  let model;
  try { model = buildModel(data, sessions, options, warnings); }
  catch (error) { return failure('CONFIGURATION', [error.message], { sessions, warnings }); }

  const feasibility = checkFeasibility(model);
  warnings.push(...feasibility.warnings);
  feasibility.errors.unshift(...model.fixedErrors);
  feasibility.feasible = feasibility.errors.length === 0;
  const candidateCounts = new Map(sessions.map((s, i) => [s.id, model.sessionInfo[i].cands.length]));
  if (!feasibility.feasible) {
    return failure('FEASIBILITY', [...shortfallMessage(), ...feasibility.errors.map(e => e.message)], { sessions, warnings, feasibility, candidateCounts, stats: { timeMs: Date.now() - started }, teacherPlan: teacherSummary() });
  }

  const result = solve(model, options);
  const stats = { ...result.stats, timeMs: Date.now() - started };
  const hardest = [...result.failCount].map((count, i) => ({ count, i })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 10)
    .map(({ count, i }) => ({ sessionId: sessions[i].id, courseName: sessions[i].courseName, divisionName: sessions[i].divisionName, batch: sessions[i].batch, failures: count }));

  if (result.status !== 'SOLVED') {
    const partial = result.chosen ? toAssignments(model, result.chosen) : new Map();
    const unplaced = sessions.filter(s => !partial.has(s.id)).map(s => s.id);
    const message = result.status === 'EXHAUSTED'
      ? 'No timetable exists for this data: every combination of teachers, rooms and times was ruled out. The sessions listed in diagnostics.hardestSessions are the ones that could not be fitted - relax their constraints (more teachers, rooms, periods or fewer hours).'
      : `No timetable was found within the time limit (${Math.round((options.timeLimitMs ?? DEFAULTS.timeLimitMs) / 1000)} s). The data passed every feasibility check, so it may still be solvable: increase options.timeLimitMs, or relax constraints around the sessions in diagnostics.hardestSessions.${feasibility.warnings.length ? ` Nearly-full resources: ${feasibility.warnings.slice(0, 5).join('; ')}.` : ''}`;
    return failure(result.status === 'EXHAUSTED' ? 'NO_SOLUTION' : 'TIME_LIMIT', [...shortfallMessage(), message], {
      teacherPlan: teacherSummary(),
      sessions, warnings, feasibility, candidateCounts, stats,
      partialAssignments: partial, unplacedSessions: unplaced,
      diagnostics: { hardestSessions: hardest, provenImpossible: result.status === 'EXHAUSTED' }
    });
  }

  const assignments = toAssignments(model, result.chosen);
  const validation = validateFinalTimetable(sessions, assignments, {
    availableSlots: model.classSlots,
    allAvailableSlots: model.units,
    labWindows: model.labWindows,
    timeConfig: options.timeConfig,
    rooms: data.rooms,
    faculty: model.faculty
  });
  return {
    success: validation.valid,
    method: 'GreedyBacktracking',
    stage: validation.valid ? 'DONE' : 'FINAL_VALIDATION',
    sessions, assignments,
    timetable: toTimetableRows(sessions, assignments, model),
    errors: validation.errors, warnings, validation, feasibility, candidateCounts, stats,
    diagnostics: { hardestSessions: hardest },
    facultyChanges: teacherPlan ? actualChanges(sessions, assignments, facultyNames, tierBySession) : [],
    teacherPlan: teacherSummary()
  };
}

module.exports = { generateTimetableFromData, buildModel, solve, DEFAULTS };
