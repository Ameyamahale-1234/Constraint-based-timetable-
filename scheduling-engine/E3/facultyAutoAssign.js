/**
 * Automatic teacher reassignment for overloaded (or unmapped) courses.
 *
 * Runs BEFORE timetabling. It decides which teacher takes each teaching group
 * (a theory course for one division, or one lab batch) so that nobody has more
 * hours than they can teach. Groups move as a whole, so a division keeps one
 * teacher for a course all week.
 *
 * Replacement teachers are searched in tiers, in this order:
 *   1. COURSE      - teachers already mapped to the same course (other divisions/batches)
 *   2. DEPARTMENT  - teachers of the course's department (needs dept_id on faculty and course/teacher)
 *   3. ANY         - any teacher with free hours (last resort)
 * mode 'course' allows tier 1, 'department' tiers 1-2, 'any' tiers 1-3, 'off' disables the feature.
 *
 * The plan is a preference: the timetable search still enforces every hard
 * rule (clashes, hour limits, availability) and may pick another listed teacher.
 */
const { toId } = require('./data/dataNormalizer');

const TIER_LABEL = { MAPPED: 'mapped teacher', COURSE: 'teaches this course to another division', DEPARTMENT: 'same department, has free hours', ANY: 'has free hours (no subject match in the data)' };
const MODES = { off: 0, course: 1, department: 2, any: 3 };

function first(row, keys) { for (const k of keys) if (row && row[k] != null && row[k] !== '') return row[k]; return null; }

function planFacultyAssignment(data, sessions, options = {}) {
  const mode = MODES[options.autoAssignFaculty ?? 'any'] ?? 3;
  const result = { mode: options.autoAssignFaculty ?? 'any', changes: [], unresolved: [], shortfall: null };
  if (!mode) return result;

  const weekSlots = options.weeklyTeachingMinutes ?? 44 * 60;
  const days = options.workingDayCount ?? 6;
  const faculty = (data.faculty || []).map(f => {
    const id = toId(f.facultyId ?? f.faculty_id);
    const maxWeek = f.maxHoursPerWeek ?? options.maxFacultyHoursPerWeek;
    const maxDay = f.maxHoursPerDay ?? options.maxFacultyHoursPerDay;
    const cap = Math.min(weekSlots, maxWeek != null ? maxWeek * 60 : Infinity, maxDay != null ? maxDay * 60 * days : Infinity);
    return { id, name: f.name ?? f.faculty_name ?? id, dept: toId(first(f, ['dept_id', 'deptId', 'department_id', 'department'])), cap };
  }).filter(f => f.id != null);
  const facById = new Map(faculty.map(f => [f.id, f]));
  const courseDept = new Map((data.courses || []).map(c => [toId(c.courseId ?? c.course_id), toId(first(c, ['dept_id', 'deptId', 'department_id', 'department']))]));

  // Teaching groups.
  const groups = new Map();
  for (const s of sessions) {
    const key = s.sameFacultyGroup || s.id;
    if (!groups.has(key)) groups.set(key, { key, sessions: [], courseId: s.courseId, minutes: 0, mapped: (s.eligibleFacultyIds || []).map(toId).filter(id => facById.has(id)), k: Number(s.facultyPerSession) || 1, isLab: s.isLab });
    const g = groups.get(key);
    g.sessions.push(s);
    g.minutes += Number(s.durationHours || 1) * 60;
  }
  const courseTeachers = new Map();
  for (const g of groups.values()) for (const f of g.mapped) {
    if (!courseTeachers.has(g.courseId)) courseTeachers.set(g.courseId, new Set());
    courseTeachers.get(g.courseId).add(f);
  }

  const load = new Map(faculty.map(f => [f.id, 0]));
  const assigned = new Map(); // group key -> { teacher, tier }
  const ratio = f => load.get(f) / Math.max(1, facById.get(f).cap);
  const fits = (f, minutes, limit) => load.get(f) + minutes <= facById.get(f).cap * limit;
  const tiersFor = (g, exclude) => {
    const out = [];
    const course = [...(courseTeachers.get(g.courseId) || [])].filter(f => !g.mapped.includes(f) && f !== exclude);
    if (mode >= 1) out.push(['COURSE', course]);
    if (mode >= 2) {
      const dept = courseDept.get(g.courseId) ?? (g.mapped[0] && facById.get(g.mapped[0]).dept) ?? null;
      out.push(['DEPARTMENT', dept == null ? [] : faculty.filter(f => f.dept === dept && f.id !== exclude && !g.mapped.includes(f.id)).map(f => f.id)]);
    }
    if (mode >= 3) out.push(['ANY', faculty.map(f => f.id).filter(f => f !== exclude && !g.mapped.includes(f))]);
    return out;
  };
  const pick = (candidates, minutes, limit) => candidates.filter(f => fits(f, minutes, limit)).sort((a, b) => ratio(a) - ratio(b))[0];

  // Team-taught groups keep their mapped teachers (needs k teachers at once).
  const ordered = [...groups.values()].sort((a, b) => a.mapped.length - b.mapped.length || b.minutes - a.minutes);
  for (const g of ordered) {
    if (g.k > 1) { assigned.set(g.key, { teachers: g.mapped, tier: 'MAPPED' }); g.mapped.forEach(f => load.set(f, load.get(f) + g.minutes)); continue; }
    // Least-loaded mapped teacher that still fits; otherwise the least-loaded mapped teacher (fixed below).
    let teacher = pick(g.mapped, g.minutes, 0.9) ?? [...g.mapped].sort((a, b) => ratio(a) - ratio(b))[0];
    let tier = 'MAPPED';
    if (!teacher) { // nobody mapped: fill from the tiers
      for (const [name, list] of tiersFor(g, null)) { teacher = pick(list, g.minutes, 0.9) ?? pick(list, g.minutes, 1); if (teacher) { tier = name; break; } }
    }
    if (!teacher) { result.unresolved.push({ group: g, reason: 'no teacher is mapped and nobody has free hours' }); continue; }
    assigned.set(g.key, { teachers: [teacher], tier });
    load.set(teacher, load.get(teacher) + g.minutes);
  }

  // Relieve overloaded teachers: move their groups to the best tier with free hours.
  for (const limit of [0.9, 1]) {
    for (const f of faculty.map(x => x.id).sort((a, b) => ratio(b) - ratio(a))) {
      if (load.get(f) <= facById.get(f).cap) continue;
      const mine = ordered.filter(g => assigned.get(g.key)?.teachers.length === 1 && assigned.get(g.key).teachers[0] === f).sort((a, b) => b.minutes - a.minutes);
      for (const g of mine) {
        if (load.get(f) <= facById.get(f).cap) break;
        let moved = false;
        // First try another mapped teacher of this group, then the tiers.
        const options2 = [['MAPPED', g.mapped.filter(x => x !== f)], ...tiersFor(g, f)];
        for (const [name, list] of options2) {
          const t = pick(list, g.minutes, limit);
          if (!t) continue;
          assigned.set(g.key, { teachers: [t], tier: name });
          load.set(f, load.get(f) - g.minutes);
          load.set(t, load.get(t) + g.minutes);
          moved = true;
          break;
        }
        if (!moved && limit === 1) result.unresolved.push({ group: g, reason: `${facById.get(f).name} is overloaded and no allowed teacher has ${g.minutes / 60} free hour(s)` });
      }
    }
  }

  // Apply the plan to the sessions.
  for (const g of groups.values()) {
    const a = assigned.get(g.key);
    if (!a) continue;
    const original = g.mapped;
    for (const s of g.sessions) {
      s.originalFacultyIds = original;
      s.preferredFacultyIds = a.teachers;
      if (a.tier !== 'MAPPED') {
        // The planned teacher plus the original ones (the search may keep an original if it still fits).
        s.eligibleFacultyIds = [...new Set([...a.teachers, ...original])];
        s.reassignmentTier = a.tier;
      }
    }
    if (a.tier !== 'MAPPED' || (original.length && !original.includes(a.teachers[0]))) {
      const s = g.sessions[0];
      result.changes.push({
        courseId: s.courseId, courseName: s.courseName, divisionId: s.divisionId, divisionName: s.divisionName,
        batch: s.isLab ? s.batch : null, hours: g.minutes / 60,
        from: original.map(id => facById.get(id)?.name ?? id), to: a.teachers.map(id => facById.get(id)?.name ?? id),
        toIds: a.teachers, tier: a.tier, why: TIER_LABEL[a.tier]
      });
    }
  }

  const demand = [...groups.values()].reduce((sum, g) => sum + g.minutes * g.k, 0);
  const capacity = faculty.reduce((sum, f) => sum + Math.min(f.cap, weekSlots), 0);
  if (demand > capacity) {
    const avgCap = capacity / Math.max(1, faculty.length);
    result.shortfall = { neededHours: Math.round(demand / 60), availableHours: Math.round(capacity / 60), extraTeachers: Math.ceil((demand - capacity) / Math.max(60, avgCap)) };
  }
  result.loads = faculty.map(f => ({ id: f.id, name: f.name, hours: load.get(f.id) / 60, capHours: Number.isFinite(f.cap) ? f.cap / 60 : null }));
  return result;
}

/** After scheduling: the reassignments that actually happened in the final timetable. */
function actualChanges(sessions, assignments, facultyNames, tierBySession) {
  const seen = new Map();
  for (const s of sessions) {
    const a = assignments.get(s.id);
    if (!a || !s.originalFacultyIds) continue;
    const now = (a.facultyIds || [a.facultyId]).map(String);
    if (s.originalFacultyIds.length && now.every(f => s.originalFacultyIds.includes(f))) continue;
    const key = s.sameFacultyGroup || s.id;
    if (!seen.has(key)) {
      seen.set(key, {
        courseId: s.courseId, courseName: s.courseName, divisionId: s.divisionId, divisionName: s.divisionName,
        batch: s.isLab ? s.batch : null, hours: 0,
        from: s.originalFacultyIds.map(id => facultyNames.get(id) ?? id),
        to: now.map(id => facultyNames.get(id) ?? id),
        tier: tierBySession.get(s.id) || 'ANY',
        why: TIER_LABEL[tierBySession.get(s.id) || 'ANY']
      });
    }
    seen.get(key).hours += Number(s.durationHours || 1);
  }
  return [...seen.values()];
}

module.exports = { planFacultyAssignment, actualChanges, TIER_LABEL, MODES };
