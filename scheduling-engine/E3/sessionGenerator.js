const { LAB_DURATION_BY_CREDIT } = require('./data/dataNormalizer');

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (value == null || value === '') return [];
  return String(value).split(/[,;/|]/).map(v => v.trim()).filter(Boolean);
}
function idOf(row, keys) { for (const key of keys) if (row[key] != null) return row[key]; return null; }
function generateSessions(data, options = {}) {
  const sessions = [];
  const courseMap = new Map((data.courses || []).map(c => [String(c.courseId ?? c.course_id), c]));
  const facultyMap = data.courseFaculty || [];
  const divisionMap = data.courseDivision || [];
  const divisions = data.divisions || [];
  const durationMap = { ...LAB_DURATION_BY_CREDIT, ...(options.labDurationByCredit || {}) };
  for (const course of data.courses || []) {
    const courseId = String(course.courseId ?? course.course_id);
    const courseType = String(course.courseType || course.course_type || '').toUpperCase();
    const isLab = courseType === 'LAB' || courseType.includes('LAB');
    const credits = Number(course.credits);
    const labDuration = isLab ? Number(course.durationHours || durationMap[credits]) : null;
    if (isLab && (!labDuration || !Number.isFinite(labDuration))) throw new Error(`No lab duration configured for course ${courseId} (${credits} credits)`);
    const offerings = divisionMap.filter(x => String(idOf(x, ['courseId','course_id'])) === courseId);
    for (const offering of offerings) {
      const divisionId = idOf(offering, ['divisionId','division_id']);
      const divisionRecord = divisions.find(d => String(idOf(d, ['divisionId','division_id'])) === String(divisionId));
      const divisionName = idOf(offering, ['divisionName','division_name']) || idOf(divisionRecord || {}, ['divisionName','division_name','name']);
      const eligible = facultyMap.filter(x => String(idOf(x, ['courseId','course_id'])) === courseId &&
        (!x.division_batch || parseList(x.division_batch).some(v => v === String(divisionId) || v === String(divisionName))));
      const eligibleFacultyIds = [...new Set(eligible.map(x => idOf(x, ['facultyId','faculty_id'])).filter(x => x != null))];
      const batches = isLab
        ? [...new Set(eligible.flatMap(x => parseList(x.division_batch)).filter(x => /\d/.test(x)))]
        : [];
      const targets = isLab && batches.length ? batches : [null];
      let patterns;
      if (isLab) patterns = [{ durationHours: labDuration, occurrence: 1 }];
      else if (credits === 3) patterns = Array.from({ length: 3 }, (_, i) => ({ durationHours: 1, occurrence: i + 1 }));
      else if (credits === 4) patterns = [{ durationHours: 2, occurrence: 1, distinctDayGroup: 'four-credit' }, { durationHours: 2, occurrence: 2, distinctDayGroup: 'four-credit' }];
      else patterns = Array.from({ length: Math.max(1, Math.round(credits)) }, (_, i) => ({ durationHours: 1, occurrence: i + 1 }));
      for (const batch of targets) for (const pattern of patterns) {
        const sessionId = `${courseId}-${divisionId}-${batch || 'FULL'}-${pattern.occurrence}`;
        sessions.push({
          id: sessionId, courseId, courseName: course.courseName || course.course_name,
          courseType: isLab ? 'LAB' : 'THEORY', type: isLab ? 'LAB' : 'THEORY', isLab,
          credits, durationHours: pattern.durationHours, durationSlots: pattern.durationHours,
          divisionId, batch: batch || (isLab ? null : `${divisionId}(full)`),
          batchIds: batch ? [batch] : [], eligibleFacultyIds,
          facultyId: null, roomId: null, distinctDayGroup: pattern.distinctDayGroup || null,
          occurrence: pattern.occurrence, requiresRoomType: isLab ? 'LAB' : 'CLASSROOM'
        });
      }
    }
  }
  return sessions;
}
module.exports = { generateSessions, parseList };
