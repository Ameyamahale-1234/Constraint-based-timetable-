const { LAB_DURATION_BY_CREDIT } = require('./data/dataNormalizer');

function parseList(value) {
  if (Array.isArray(value)) return value.flatMap(parseList);
  if (value == null || value === '') return [];
  return String(value).split(/[,;/|]/).map(v => v.trim()).filter(Boolean);
}
function idOf(row, keys) {
  for (const key of keys) if (row && row[key] != null && row[key] !== '') return row[key];
  return null;
}
function sameId(a, b) { return a != null && b != null && String(a) === String(b); }
function getCourseType(course) {
  const type = String(course.courseType || course.course_type || course.type || '').trim().toUpperCase();
  return type.includes('LAB') || type.includes('PRACT') ? 'LAB' : type.includes('PROJECT') ? 'PROJECT' : 'THEORY';
}
function facultyForDivision(courseId, divisionId, divisionName, mappings, batch) {
  const eligible = mappings.filter(row => {
    if (!sameId(idOf(row, ['courseId', 'course_id']), courseId)) return false;
    const mapped = parseList(idOf(row, ['division_batch', 'divisionBatch', 'division', 'division_name']));
    if (!mapped.length) return true;
    return mapped.some(value => {
      const normalized = value.toUpperCase().replace(/\s/g, '');
      return normalized === String(divisionName || '').toUpperCase() ||
        normalized === String(divisionId || '').toUpperCase() ||
        (batch && normalized === String(batch).toUpperCase());
    });
  });
  return [...new Set(eligible.map(row => idOf(row, ['facultyId', 'faculty_id'])).filter(v => v != null))];
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
    const courseName = idOf(course, ['courseName', 'course_name', 'name']) || `Course ${courseId}`;
    const courseType = getCourseType(course);
    const credits = Number(course.credits ?? course.credit);
    if (!Number.isFinite(credits) || credits <= 0) { errors.push(`${courseId}: Invalid or missing credits`); continue; }

    const isLab = courseType === 'LAB';
    const labDuration = isLab ? Number(course.durationHours || durationMap[credits]) : null;
    if (isLab && ![1, 2, 3].includes(labDuration)) {
      errors.push(`${courseId} (${courseName}): unsupported lab credit/duration mapping for ${credits} credits`);
      continue;
    }
    const offerings = courseDivision.filter(row => sameId(idOf(row, ['courseId', 'course_id']), courseId));
    if (!offerings.length) continue;

    for (const offering of offerings) {
      const divisionId = idOf(offering, ['divisionId', 'division_id']);
      const division = divisions.find(row => sameId(idOf(row, ['divisionId', 'division_id']), divisionId));
      const divisionName = idOf(offering, ['divisionName', 'division_name']) || idOf(division || {}, ['divisionName', 'division_name', 'name']) || String(divisionId);
      if (divisionId == null) { errors.push(`${courseId}: An offering is missing divisionId`); continue; }

      if (isLab) {
        // Lab batches are a college rule, not something inferred from the sample timetable.
        for (const batch of ['A1', 'A2']) {
          const eligibleFacultyIds = facultyForDivision(courseId, divisionId, divisionName, courseFaculty, batch);
          sessions.push({
            id: `${courseId}-${divisionId}-${batch}-1`, courseId, courseName,
            courseType: 'LAB', type: 'LAB', isLab: true, credits,
            durationHours: labDuration, durationSlots: labDuration,
            divisionId, divisionName, batch, batchIds: [batch], eligibleFacultyIds,
            facultyId: null, roomId: null, occurrence: 1,
            requiresRoomType: 'LAB', labWindow: options.labWindow || { start: '08:00', end: '12:00' }
          });
        }
      } else {
        // One weekly one-hour session per credit for theory and project courses.
        const weeklyCount = Math.floor(credits);
        if (weeklyCount !== credits) {
          errors.push(`${courseId} (${courseName}): non-lab credits must be whole numbers; received ${credits}`);
          continue;
        }
        const distinctDayGroup = weeklyCount > 1 ? `${courseId}-${divisionId}-weekly` : null;
        for (let occurrence = 1; occurrence <= weeklyCount; occurrence++) {
          const eligibleFacultyIds = facultyForDivision(courseId, divisionId, divisionName, courseFaculty);
          sessions.push({
            id: `${courseId}-${divisionId}-FULL-${occurrence}`, courseId, courseName,
            courseType, type: courseType, isLab: false, credits,
            durationHours: 1, durationSlots: 1,
            divisionId, divisionName, batch: `${divisionName}(full)`, batchIds: [],
            eligibleFacultyIds, facultyId: null, roomId: null,
            occurrence, distinctDayGroup, requiresRoomType: 'CLASSROOM'
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
module.exports = { generateSessions, parseList, facultyForDivision };
