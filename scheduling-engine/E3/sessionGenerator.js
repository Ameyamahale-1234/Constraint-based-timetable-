const { LAB_DURATION_BY_CREDIT, SUPPORTED_LAB_HOURS, toId, toNumber, toBool, parseList } = require('./data/dataNormalizer');

const DEFAULT_BATCHES_PER_DIVISION = 2;

function idOf(row, keys) {
  for (const key of keys) if (row && row[key] != null && row[key] !== '') return toId(row[key]);
  return null;
}
function valueOf(row, keys) {
  for (const key of keys) if (row && row[key] != null && row[key] !== '') return row[key];
  return null;
}
function sameId(a, b) { return a != null && b != null && toId(a) === toId(b); }
function canon(value) { return String(value ?? '').toUpperCase().replace(/\s/g, ''); }
function getCourseType(course) {
  const type = String(course.courseType || course.course_type || course.type || '').trim().toUpperCase();
  return type.includes('LAB') || type.includes('PRACT') ? 'LAB' : type.includes('PROJECT') ? 'PROJECT' : 'THEORY';
}

/**
 * Lab batch names for a division. Explicit names win, then an explicit count,
 * then the configured default. Names are always derived from the division
 * (division B -> B1, B2, ...), so batches of different divisions never collide.
 */
function getDivisionBatches(division, divisionName, options = {}) {
  const explicit = division?.batchNames || parseList(valueOf(division, ['batches', 'batch_names', 'lab_batches']));
  if (explicit && explicit.length) return [...new Set(explicit.map(String))];
  const count = toNumber(division?.batchCount ?? valueOf(division, ['batch_count', 'num_batches', 'numBatches']))
    ?? options.labBatchesPerDivision ?? DEFAULT_BATCHES_PER_DIVISION;
  return Array.from({ length: Math.max(1, count) }, (_, i) => `${divisionName}${i + 1}`);
}

/**
 * Teachers mapped to this course for this division (and, for batch sessions,
 * this batch). A mapping value may name the division, the division ID or a
 * batch. A batch session can be taught by teachers mapped to that batch AND by
 * teachers mapped to the whole division.
 */
function facultyForDivision(courseId, divisionId, divisionName, mappings, batch, divisionBatches = []) {
  const general = new Set();
  const specific = new Set();
  const batchKeys = new Set(divisionBatches.map(canon));
  for (const row of mappings) {
    if (!sameId(idOf(row, ['courseId', 'course_id']), courseId)) continue;
    const facultyId = idOf(row, ['facultyId', 'faculty_id']);
    if (facultyId == null) continue;
    const mapped = parseList(valueOf(row, ['division_batch', 'divisionBatch', 'division', 'division_name'])).map(canon);
    if (!mapped.length) { general.add(facultyId); continue; }
    for (const value of mapped) {
      if (value === canon(divisionName) || value === canon(divisionId)) general.add(facultyId);
      else if (batch && value === canon(batch)) specific.add(facultyId);
      else if (!batch && batchKeys.has(value)) general.add(facultyId); // whole-division session taught by a batch teacher
    }
  }
  return [...new Set([...specific, ...general])];
}

function generateSessions(data, options = {}) {
  const courses = data.courses || [];
  const divisions = data.divisions || [];
  const courseFaculty = data.courseFaculty || [];
  const courseDivision = data.courseDivision || [];
  const durationMap = { ...LAB_DURATION_BY_CREDIT, ...(options.labDurationByCredit || {}) };
  const sessions = [];
  const errors = [];

  for (const course of courses) {
    const courseId = idOf(course, ['courseId', 'course_id', 'id']);
    if (courseId == null) { errors.push('A course is missing its ID'); continue; }
    const courseName = valueOf(course, ['courseName', 'course_name', 'name']) || `Course ${courseId}`;
    const courseType = getCourseType(course);
    const credits = Number(course.credits ?? course.credit);
    if (!Number.isFinite(credits) || credits <= 0) { errors.push(`${courseId}: Invalid or missing credits`); continue; }

    const isLab = courseType === 'LAB';
    const labDuration = isLab ? Number(course.durationHours || durationMap[credits]) : null;
    if (isLab && !SUPPORTED_LAB_HOURS.includes(labDuration)) {
      errors.push(`${courseId} (${courseName}): unsupported lab credit/duration mapping for ${credits} credits`);
      continue;
    }
    if (!isLab && !Number.isInteger(credits)) {
      errors.push(`${courseId} (${courseName}): non-lab credits must be whole numbers; received ${credits}`);
      continue;
    }
    const splitBatches = toBool(course.splitBatches ?? course.split_batches) ?? isLab;
    const facultyPerSession = toNumber(course.facultyPerSession ?? course.faculty_per_session)
      ?? (isLab ? options.labFacultyPerSession : options.theoryFacultyPerSession) ?? 1;
    const requiredRoomType = valueOf(course, ['requiredRoomType', 'required_room_type']);

    const seenDivisions = new Set();
    for (const offering of courseDivision.filter(row => sameId(idOf(row, ['courseId', 'course_id']), courseId))) {
      const divisionId = idOf(offering, ['divisionId', 'division_id']);
      if (divisionId == null) { errors.push(`${courseId}: An offering is missing divisionId`); continue; }
      if (seenDivisions.has(divisionId)) continue; // duplicate offering row
      seenDivisions.add(divisionId);
      const division = divisions.find(row => sameId(idOf(row, ['divisionId', 'division_id']), divisionId));
      const divisionName = String(valueOf(offering, ['divisionName', 'division_name']) || valueOf(division || {}, ['divisionName', 'division_name', 'name']) || divisionId);
      const batches = getDivisionBatches(division, divisionName, options);
      const studentCount = toNumber(division?.studentCount ?? valueOf(division, ['student_count', 'strength', 'students', 'size']));
      // Every whole-division session occupies all of the division's batches, so
      // it can never overlap a batch session; batch sessions only block their own batch.
      const fullTokens = [`${divisionId}::*`, ...batches.map(b => `${divisionId}::${b}`)];

      const base = {
        courseId, courseName, courseType, type: courseType, isLab, credits,
        divisionId, divisionName, divisionBatches: batches,
        facultyId: null, roomId: null, facultyPerSession,
        requiresRoomType: isLab ? 'LAB' : 'CLASSROOM',
        ...(requiredRoomType ? { requiredRoomType: String(requiredRoomType) } : {}),
        ...(isLab ? { labWindow: options.labWindow || { start: '08:00', end: '12:00' } } : {})
      };
      const groups = splitBatches
        ? batches.map(batch => ({ batch, batchIds: [batch], tokens: [`${divisionId}::${batch}`], students: studentCount != null ? Math.ceil(studentCount / batches.length) : null }))
        : [{ batch: `${divisionName}(full)`, batchIds: [], tokens: fullTokens, students: studentCount, whole: true }];

      for (const group of groups) {
        const eligibleFacultyIds = facultyForDivision(courseId, divisionId, divisionName, courseFaculty, group.whole ? null : group.batch, batches);
        const label = group.whole ? 'FULL' : group.batch;
        if (isLab) {
          sessions.push({
            ...base, id: `${courseId}-${divisionId}-${label}-1`,
            durationHours: labDuration, durationSlots: labDuration,
            batch: group.batch, batchIds: group.batchIds, groupTokens: group.tokens, studentCount: group.students,
            eligibleFacultyIds, occurrence: 1, distinctDayGroup: null, sameFacultyGroup: null
          });
          continue;
        }
        // One weekly one-hour session per credit for theory and project courses,
        // each on a different day and taught by the same teacher(s).
        const weeklyCount = credits;
        const distinctDayGroup = weeklyCount > 1 ? `${courseId}-${divisionId}-${label}-weekly` : null;
        const sameFacultyGroup = options.sameFacultyForCourse === false ? null : `${courseId}-${divisionId}-${label}`;
        for (let occurrence = 1; occurrence <= weeklyCount; occurrence++) {
          sessions.push({
            ...base, id: `${courseId}-${divisionId}-${label}-${occurrence}`,
            durationHours: 1, durationSlots: 1,
            batch: group.batch, batchIds: group.batchIds, groupTokens: group.tokens, studentCount: group.students,
            eligibleFacultyIds, occurrence, distinctDayGroup, sameFacultyGroup
          });
        }
      }
    }
  }
  if (errors.length) {
    const error = new Error(`Session generation failed:\n- ${errors.join('\n- ')}`);
    error.details = errors;
    throw error;
  }
  return sessions;
}
module.exports = { generateSessions, parseList, facultyForDivision, getDivisionBatches };
