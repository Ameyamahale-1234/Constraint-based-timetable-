/**
 * Pre-search feasibility checks.
 *
 * Every check here is a NECESSARY condition: if one fails, no timetable can
 * exist, and the message says exactly what to change. Passing all checks does
 * not prove a timetable exists (that is what the search decides), but it
 * catches the common impossible inputs instantly instead of letting the
 * search run for an exponential amount of time.
 */

function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}
function unionMinutes(intervalsByDay) {
  let total = 0;
  for (const list of intervalsByDay.values()) for (const [s, e] of mergeIntervals(list)) total += e - s;
  return total;
}
function hours(minutes) { return Math.round((minutes / 60) * 100) / 100; }
function addInterval(map, day, s, e) { if (!map.has(day)) map.set(day, []); map.get(day).push([s, e]); }

/** Union of wall-clock time covered by the given candidates. */
function candidateTime(cands) {
  const byDay = new Map();
  for (const c of cands) for (const slot of c.slots) addInterval(byDay, slot.day, slot.startMinutes, slot.endMinutes);
  return byDay;
}

const TIGHT_RATIO = 0.9;

function checkFeasibility(model) {
  const errors = [];
  const warnings = []; // resources used above 90%: solvable in principle but very hard to pack
  const tight = (need, capacity, text) => { if (capacity > 0 && need <= capacity && need / capacity >= TIGHT_RATIO) warnings.push(`${text} is ${Math.round((100 * need) / capacity)}% full (${hours(need)} of ${hours(capacity)} h/week)`); };
  const { sessions, sessionInfo, faculty, rooms } = model;
  const sessionLabel = s => `${s.id} (${s.courseName}, division ${s.divisionName}${s.batchIds?.length ? `, batch ${s.batch}` : ''})`;

  // 1. Every session needs at least one faculty-room-time option.
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i], info = sessionInfo[i];
    if (info.cands.length > 0 && info.roomClasses.length > 0) continue;
    const reasons = [];
    if (info.mappedFaculty === 0) reasons.push('no teacher is mapped to this course for this division/batch in courseFaculty');
    else if (info.mappedFaculty < s.facultyPerSession) reasons.push(`it needs ${s.facultyPerSession} teachers together but only ${info.mappedFaculty} are mapped`);
    if (info.eligibleRooms === 0) reasons.push(info.roomReason);
    if (info.timeGroups === 0) reasons.push(s.isLab
      ? `no ${s.durationHours}-hour uninterrupted block exists inside the lab window(s)`
      : `no ${s.durationHours}-hour block exists in the configured class periods`);
    if (info.fixedProblem) reasons.push(info.fixedProblem);
    if (!reasons.length && info.cands.length === 0) reasons.push('the mapped teachers are never available at a time when this session could run (check faculty availability / maximum hours per day)');
    if (!reasons.length) reasons.push('no suitable room is ever available at a time this session could run (check room availability)');
    errors.push({ type: 'NO_OPTIONS', sessionId: s.id, message: `${sessionLabel(s)} cannot be placed: ${reasons.join('; ')}.` });
  }

  // 2. Sessions that must be on different days need enough distinct days.
  const dayGroups = new Map();
  sessions.forEach((s, i) => { if (s.distinctDayGroup) (dayGroups.get(s.distinctDayGroup) || dayGroups.set(s.distinctDayGroup, []).get(s.distinctDayGroup)).push(i); });
  for (const [group, members] of dayGroups) {
    const days = new Set(members.flatMap(i => sessionInfo[i].cands.map(c => c.dayName)));
    if (members.length > days.size) {
      const s = sessions[members[0]];
      errors.push({ type: 'TOO_FEW_DAYS', group, message: `${s.courseName} (division ${s.divisionName}) needs ${members.length} weekly sessions on different days, but only ${days.size} day(s) are possible. Reduce credits or add working days.` });
    }
  }

  // 3. Teacher workload: hours a teacher MUST teach vs hours they can teach.
  const forcedLoad = new Map(); // facultyIndex -> {minutes, sessions}
  for (let i = 0; i < sessions.length; i++) {
    const cands = sessionInfo[i].cands;
    if (!cands.length) continue;
    let forced = new Set(cands[0].fac);
    for (const c of cands) forced = new Set(c.fac.filter(f => forced.has(f)));
    for (const f of forced) {
      const entry = forcedLoad.get(f) || { minutes: 0, sessions: [] };
      entry.minutes += cands[0].minutes; entry.sessions.push(i);
      forcedLoad.set(f, entry);
    }
  }
  for (const [f, load] of forcedLoad) {
    const fac = faculty[f];
    const byDay = new Map();
    for (const i of load.sessions) for (const c of sessionInfo[i].cands) if (c.fac.includes(f)) for (const slot of c.slots) addInterval(byDay, slot.day, slot.startMinutes, slot.endMinutes);
    let capacity = 0;
    for (const list of byDay.values()) capacity += Math.min(unionMinutes(new Map([[0, list]])), fac.maxDayMinutes);
    capacity = Math.min(capacity, fac.maxWeekMinutes);
    tight(load.minutes, capacity, `Teacher ${fac.name || fac.id}`);
    if (load.minutes > capacity) {
      errors.push({ type: 'FACULTY_OVERLOAD', facultyId: fac.id, message: `Teacher ${fac.name || fac.id} is the only teacher for ${load.sessions.length} sessions totalling ${hours(load.minutes)} h/week, but can teach at most ${hours(capacity)} h/week in the available time${Number.isFinite(fac.maxDayMinutes) || Number.isFinite(fac.maxWeekMinutes) ? ' (including their hour limits)' : ''}. Assign some of these courses to another teacher.` });
    }
  }

  // 3b. Teacher pools: sessions that can only be taught by teachers from a
  // group must fit in that group's combined teaching time (Hall's condition).
  // A teacher's capacity is measured only over the times the member sessions
  // can actually run (e.g. labs only fit in the lab window), capped by limits.
  // Labs and theory are also checked separately for the same reason.
  const unitsOf = sessionInfo.map(info => {
    const byFac = new Map();
    for (const c of info.cands) for (const f of c.fac) { if (!byFac.has(f)) byFac.set(f, new Set()); for (const u of c.units) byFac.get(f).add(u); }
    return byFac;
  });
  const teacherTime = (f, members) => {
    const seen = new Set();
    for (const i of members) for (const u of unitsOf[i].get(f) || []) seen.add(u);
    const byDay = new Map();
    for (const u of seen) { const slot = model.units[u]; addInterval(byDay, slot.day, slot.startMinutes, slot.endMinutes); }
    let cap = 0;
    for (const list of byDay.values()) cap += Math.min(unionMinutes(new Map([[0, list]])), faculty[f].maxDayMinutes);
    return Math.min(cap, faculty[f].maxWeekMinutes);
  };
  const poolOf = sessionInfo.map(info => [...new Set(info.cands.flatMap(c => c.fac))].sort((a, b) => a - b));
  const pools = new Map();
  for (const p of poolOf) if (p.length) pools.set(p.join(','), p);
  const basePools = [...pools.values()].slice(0, 200);
  for (let x = 0; x < basePools.length; x++) for (let y = x + 1; y < basePools.length; y++) {
    if (pools.size >= 1500) break;
    const merged = [...new Set([...basePools[x], ...basePools[y]])].sort((a, b) => a - b);
    pools.set(merged.join(','), merged);
  }
  const allTeachers = [...new Set(poolOf.flat())].sort((a, b) => a - b);
  if (allTeachers.length) pools.set(allTeachers.join(','), allTeachers);
  const reported = new Set();
  const variants = [['all', () => true], ['lab', i => sessions[i].isLab], ['theory', i => !sessions[i].isLab]];
  for (const pool of pools.values()) {
    const set = new Set(pool);
    const names = pool.map(f => faculty[f].name || faculty[f].id);
    for (const [variant, include] of variants) {
      const members = [];
      let need = 0;
      for (let i = 0; i < sessions.length; i++) {
        if (!include(i) || !poolOf[i].length || !poolOf[i].every(f => set.has(f))) continue;
        need += sessionInfo[i].cands[0].minutes * (sessions[i].facultyPerSession || 1);
        members.push(i);
      }
      if (!members.length) continue;
      const capacity = pool.reduce((sum, f) => sum + teacherTime(f, members), 0);
      const who = pool.length > 1 ? `the ${pool.length} teachers [${names.join(', ')}], who together` : `teacher ${names[0]}, who`;
      if (variant === 'all' && pool.length > 1) tight(need, capacity, `The teacher group [${names.join(', ')}]`);
      if (need > capacity && !reported.has(pool.join(','))) {
        reported.add(pool.join(','));
        const kind = variant === 'lab' ? 'lab ' : variant === 'theory' ? 'theory ' : '';
        errors.push({ type: 'FACULTY_GROUP_OVERLOAD', message: `${members.length} ${kind}sessions (${hours(need)} teacher-hours/week) can only be taught by ${who} can teach at most ${hours(capacity)} h/week of ${kind}time${variant === 'lab' ? ' inside the lab window' : ''}. Map more teachers to these courses${variant === 'lab' ? ' or widen the lab window' : ''}.` });
      }
    }
  }

  // 4. Student-group load: a division/batch cannot attend more hours than exist.
  const tokenLoad = new Map();
  for (let i = 0; i < sessions.length; i++) {
    for (const t of sessionInfo[i].tokens) {
      const entry = tokenLoad.get(t) || { minutes: 0, sessions: [] };
      entry.minutes += sessionInfo[i].cands[0]?.minutes || 0; entry.sessions.push(i);
      tokenLoad.set(t, entry);
    }
  }
  for (const [token, load] of tokenLoad) {
    const capacity = unionMinutes(candidateTime(load.sessions.flatMap(i => sessionInfo[i].cands)));
    const s = sessions[load.sessions[0]];
    const who = String(token).endsWith('::*') ? `Division ${s.divisionName}` : `Batch ${String(token).split('::')[1]} of division ${s.divisionName}`;
    tight(load.minutes, capacity, who);
    if (load.minutes > capacity) {
      errors.push({ type: 'GROUP_OVERLOAD', token, message: `${who} has ${hours(load.minutes)} h/week of sessions but only ${hours(capacity)} h/week of usable time. Reduce its courses/credits or add periods.` });
    }
  }

  // 5. Room pools: sessions that can only use a set of rooms must fit in those rooms' time.
  const bySet = new Map();
  for (let i = 0; i < sessions.length; i++) {
    const set = sessionInfo[i].roomList;
    if (!set.length || !sessionInfo[i].cands.length) continue;
    const key = [...set].sort((a, b) => a - b).join(',');
    if (!bySet.has(key)) bySet.set(key, new Set(set));
  }
  for (const [key, set] of bySet) {
    const members = [];
    for (let i = 0; i < sessions.length; i++) if (sessionInfo[i].roomList.length && sessionInfo[i].roomList.every(r => set.has(r)) && sessionInfo[i].cands.length) members.push(i);
    const need = members.reduce((sum, i) => sum + sessionInfo[i].cands[0].minutes, 0);
    const capacity = set.size * unionMinutes(candidateTime(members.flatMap(i => sessionInfo[i].cands)));
    const kind = sessions[members[0]].requiredRoomType || sessions[members[0]].requiresRoomType;
    tight(need, capacity, `The pool of ${set.size} ${kind.toLowerCase()} room(s)`);
    if (need > capacity) {
      errors.push({ type: 'ROOM_SHORTAGE', rooms: key, message: `${members.length} sessions need ${hours(need)} h/week in ${set.size} suitable ${kind.toLowerCase()} room(s) [${[...set].map(r => rooms[r].id).join(', ')}], which offer only ${hours(capacity)} h/week in the allowed times. Add rooms of this type or widen the allowed time.` });
      continue;
    }
    // 5b. Lab packing: each lab must fit inside one daily lab-window block of
    // one room. Total hours can fit while the blocks still cannot hold the labs
    // (e.g. a 3-hour lab leaves a 1-hour gap that a 2-hour lab cannot use).
    const labOnly = members.every(i => sessions[i].isLab && sessionInfo[i].cands.every(c => c.slots.every(s => s.type === 'LAB_WINDOW')));
    if (labOnly && model.labSlots.length) {
      const blocks = [];
      const byDay = new Map();
      for (const s of model.labSlots) addInterval(byDay, s.day, s.startMinutes, s.endMinutes);
      for (const list of byDay.values()) for (const [s, e] of mergeIntervals(list)) blocks.push(e - s);
      const L = Math.max(...blocks);
      const bins = set.size * blocks.length;
      const sizes = members.map(i => sessionInfo[i].cands[0].minutes).sort((a, b) => b - a);
      const big = sizes.filter(x => x > L / 2), small = sizes.filter(x => x <= L / 2);
      // Upper bound on how much small-lab time fits into the gaps next to big labs.
      const holes = big.map(b => ({ size: L - b, left: L - b }));
      let absorbed = 0;
      for (const s of small) {
        let rest = s;
        for (const h of holes) { if (rest <= 0) break; if (h.size < s || h.left <= 0) continue; const take = Math.min(h.left, rest); h.left -= take; rest -= take; absorbed += take; }
      }
      const smallTotal = small.reduce((a, b) => a + b, 0);
      const minBins = big.length + Math.ceil(Math.max(0, smallTotal - absorbed) / L);
      if (minBins > bins) {
        const mix = [180, 120, 60].map(m => `${sizes.filter(x => x === m).length}×${m / 60}h`).join(', ');
        errors.push({ type: 'LAB_PACKING', rooms: key, message: `The labs (${mix}) cannot be packed into ${set.size} lab room(s) × ${blocks.length} daily lab-window blocks: at least ${minBins} room-blocks are needed but only ${bins} exist (a ${hours(L)}-hour window cannot hold every combination of lab lengths). Add a lab room, widen the lab window or change lab durations.` });
      } else if (minBins / bins >= TIGHT_RATIO) {
        warnings.push(`Lab packing needs at least ${minBins} of ${bins} available room-blocks (${Math.round((100 * minBins) / bins)}%)`);
      }
    }
  }

  // 6. Sessions fixed to a single option that collide with each other.
  const single = [];
  for (let i = 0; i < sessions.length; i++) if (sessionInfo[i].cands.length === 1 && sessionInfo[i].fixed) single.push(i);
  for (let x = 0; x < single.length; x++) for (let y = x + 1; y < single.length; y++) {
    const a = sessionInfo[single[x]], b = sessionInfo[single[y]];
    if (!model.timesOverlap(a.cands[0], b.cands[0])) continue;
    const sharedFaculty = a.cands[0].fac.some(f => b.cands[0].fac.includes(f));
    const sharedGroup = a.tokens.some(t => b.tokens.includes(t));
    const sharedRoom = a.roomList.length === 1 && b.roomList.length === 1 && a.roomList[0] === b.roomList[0];
    if (sharedFaculty || sharedGroup || sharedRoom) {
      errors.push({ type: 'FIXED_CONFLICT', message: `Fixed sessions ${sessions[single[x]].id} and ${sessions[single[y]].id} are fixed at overlapping times and share a ${sharedFaculty ? 'teacher' : sharedGroup ? 'student group' : 'room'}.` });
    }
  }

  return { feasible: errors.length === 0, errors, warnings };
}

module.exports = { checkFeasibility, mergeIntervals };
