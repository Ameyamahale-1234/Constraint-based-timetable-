const LAB_DURATION_BY_CREDIT = Object.freeze({ 1: 1, 1.5: 2, 2: 2, 3: 3 });
const SUPPORTED_LAB_HOURS = Object.freeze([1, 2, 3]);

function array(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'object') return Object.values(value);
  return [value];
}
function first(record, keys, fallback = null) {
  for (const key of keys) {
    if (record && record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return fallback;
}
/**
 * Canonical ID form used everywhere in the engine: a trimmed string.
 * 4, "4", " 4 " and "4.0" (common Excel output) all become "4", so the same
 * teacher/room/division can never be treated as two different resources.
 */
function toId(value) {
  if (value === undefined || value === null) return null;
  let text = String(value).trim();
  if (text === '') return null;
  if (/^-?\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, '');
  return text;
}
function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function toBool(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return fallback;
}
function parseList(value) {
  if (Array.isArray(value)) return value.flatMap(parseList);
  if (value == null || value === '') return [];
  return String(value).split(/[,;/|]/).map(v => v.trim()).filter(Boolean);
}
function normalizeCourseType(value) {
  const type = String(value || '').trim().toUpperCase();
  if (type.includes('LAB') || type.includes('PRACT')) return 'LAB';
  if (type.includes('PROJECT')) return 'PROJECT';
  return 'THEORY';
}

function normalizeData(raw = {}) {
  const courses = array(raw.courses ?? raw.Course).map(row => {
    const credits = Number(first(row, ['credits', 'credit', 'course_credits'], 0));
    const courseType = normalizeCourseType(first(row, ['courseType', 'course_type', 'type']));
    const explicitDuration = toNumber(first(row, ['durationHours', 'duration_hours', 'lab_duration_hours']));
    const facultyPerSession = toNumber(first(row, ['facultyPerSession', 'faculty_per_session', 'faculty_count', 'required_faculty']));
    const splitBatches = toBool(first(row, ['splitBatches', 'split_batches', 'batch_wise']));
    const requiredRoomType = first(row, ['requiredRoomType', 'required_room_type']);
    return {
      ...row,
      courseId: toId(first(row, ['courseId', 'course_id', 'id'])),
      courseName: first(row, ['courseName', 'course_name', 'name']),
      courseType,
      credits,
      ...(courseType === 'LAB'
        ? { durationHours: SUPPORTED_LAB_HOURS.includes(explicitDuration) ? explicitDuration : (LAB_DURATION_BY_CREDIT[credits] ?? null) }
        : {}),
      ...(facultyPerSession != null ? { facultyPerSession } : {}),
      ...(splitBatches != null ? { splitBatches } : {}),
      ...(requiredRoomType != null ? { requiredRoomType: String(requiredRoomType) } : {})
    };
  });
  return {
    department: array(raw.department ?? raw.Department),
    faculty: array(raw.faculty ?? raw.Faculty).map(r => ({
      ...r,
      facultyId: toId(first(r, ['facultyId', 'faculty_id', 'id'])),
      name: first(r, ['name', 'faculty_name']),
      maxHoursPerDay: toNumber(first(r, ['maxHoursPerDay', 'max_hours_per_day', 'max_load_per_day'])),
      maxHoursPerWeek: toNumber(first(r, ['maxHoursPerWeek', 'max_hours_per_week', 'max_load_per_week', 'max_load']))
    })),
    courses,
    divisions: array(raw.divisions ?? raw.Division).map(r => {
      const batches = parseList(first(r, ['batches', 'batch_names', 'lab_batches']));
      return {
        ...r,
        divisionId: toId(first(r, ['divisionId', 'division_id', 'id'])),
        divisionName: first(r, ['divisionName', 'division_name', 'name']),
        studentCount: toNumber(first(r, ['studentCount', 'student_count', 'strength', 'students', 'size'])),
        batchNames: batches.length ? batches : null,
        batchCount: toNumber(first(r, ['batchCount', 'batch_count', 'num_batches', 'numBatches']))
      };
    }),
    rooms: array(raw.rooms ?? raw.Room).map(r => ({
      ...r,
      roomId: toId(first(r, ['roomId', 'room_id', 'id'])),
      roomName: first(r, ['roomName', 'room_name', 'name']),
      roomType: first(r, ['roomType', 'room_type']),
      capacity: toNumber(first(r, ['capacity', 'room_capacity', 'seats']))
    })),
    courseFaculty: array(raw.courseFaculty ?? raw.Course_Faculty ?? raw.teaches).map(r => ({
      ...r,
      courseId: toId(first(r, ['courseId', 'course_id'])),
      facultyId: toId(first(r, ['facultyId', 'faculty_id']))
    })),
    courseDivision: array(raw.courseDivision ?? raw.Course_Division ?? raw.offeredTo).map(r => ({
      ...r,
      courseId: toId(first(r, ['courseId', 'course_id'])),
      divisionId: toId(first(r, ['divisionId', 'division_id']))
    })),
    facultyAvailability: array(raw.facultyAvailability),
    roomAvailability: array(raw.roomAvailability),
    fixedAssignments: array(raw.fixedAssignments ?? raw.Fixed_Assignments),
    constraints: { ...(raw.constraints || {}) }
  };
}

function checkIds(rows, key, label, errors) {
  const seen = new Set();
  for (const row of rows || []) {
    const id = toId(row[key]);
    if (id == null) errors.push(`${label} record is missing ${key}`);
    else if (seen.has(id)) errors.push(`Duplicate ${key} ${id}`);
    else seen.add(id);
  }
  return seen;
}

/**
 * Structural validation. Errors make the data unusable; warnings are reported
 * but scheduling can still proceed.
 */
function validateNormalizedData(data) {
  const errors = [];
  const warnings = [];
  const requiredArrays = ['faculty', 'courses', 'divisions', 'rooms', 'courseFaculty', 'courseDivision'];
  for (const key of requiredArrays) if (!Array.isArray(data[key])) errors.push(`${key} must be an array`);

  const courseIds = checkIds(data.courses, 'courseId', 'Course', errors);
  const facultyIds = checkIds(data.faculty, 'facultyId', 'Faculty', errors);
  const divisionIds = checkIds(data.divisions, 'divisionId', 'Division', errors);
  checkIds(data.rooms, 'roomId', 'Room', errors);

  for (const course of data.courses || []) {
    const id = course.courseId;
    if (!course.courseName) errors.push(`Course ${id ?? '(unknown)'} is missing courseName`);
    if (!Number.isFinite(course.credits) || course.credits <= 0) errors.push(`Course ${id ?? course.courseName} has invalid credits`);
    if (course.courseType === 'LAB' && !course.durationHours) errors.push(`Lab ${id} has unsupported credit value ${course.credits}; supported lab credits are 1, 1.5, 2 and 3 (or give durationHours 1, 2 or 3)`);
    if (course.courseType !== 'LAB' && Number.isFinite(course.credits) && !Number.isInteger(course.credits)) errors.push(`Course ${id} (${course.courseName}): non-lab credits must be whole numbers; received ${course.credits}`);
    if (course.facultyPerSession != null && (!Number.isInteger(course.facultyPerSession) || course.facultyPerSession < 1)) errors.push(`Course ${id}: facultyPerSession must be a positive whole number`);
  }
  for (const division of data.divisions || []) {
    if (division.batchCount != null && (!Number.isInteger(division.batchCount) || division.batchCount < 1)) errors.push(`Division ${division.divisionId}: batch count must be a positive whole number`);
  }

  // Referential integrity: every mapping must point at a real record.
  const offered = new Set();
  for (const [i, row] of (data.courseDivision || []).entries()) {
    if (row.courseId == null || row.divisionId == null) { errors.push(`courseDivision row ${i + 1} is missing courseId or divisionId`); continue; }
    if (!courseIds.has(row.courseId)) errors.push(`courseDivision row ${i + 1} refers to unknown course ${row.courseId}`);
    if (!divisionIds.has(row.divisionId)) errors.push(`courseDivision row ${i + 1} refers to unknown division ${row.divisionId}`);
    const key = `${row.courseId}|${row.divisionId}`;
    if (offered.has(key)) warnings.push(`Course ${row.courseId} is offered to division ${row.divisionId} more than once; duplicates are ignored`);
    offered.add(key);
  }
  for (const [i, row] of (data.courseFaculty || []).entries()) {
    if (row.courseId == null || row.facultyId == null) { errors.push(`courseFaculty row ${i + 1} is missing courseId or facultyId`); continue; }
    if (!courseIds.has(row.courseId)) errors.push(`courseFaculty row ${i + 1} refers to unknown course ${row.courseId}`);
    if (!facultyIds.has(row.facultyId)) errors.push(`courseFaculty row ${i + 1} refers to unknown faculty ${row.facultyId}`);
  }
  for (const course of data.courses || []) {
    if (course.courseId != null && ![...offered].some(k => k.startsWith(`${course.courseId}|`))) warnings.push(`Course ${course.courseId} (${course.courseName}) is not offered to any division and will not be scheduled`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  normalizeData, validateNormalizedData, LAB_DURATION_BY_CREDIT, SUPPORTED_LAB_HOURS,
  normalizeCourseType, toId, toNumber, toBool, parseList
};
