const LAB_DURATION_BY_CREDIT = Object.freeze({ 1: 1, 1.5: 2, 2: 2, 3: 3 });

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
    return {
      ...row,
      courseId: first(row, ['courseId', 'course_id', 'id']),
      courseName: first(row, ['courseName', 'course_name', 'name']),
      courseType,
      credits,
      ...(courseType === 'LAB' ? { durationHours: LAB_DURATION_BY_CREDIT[credits] ?? null } : {})
    };
  });
  return {
    department: array(raw.department ?? raw.Department),
    faculty: array(raw.faculty ?? raw.Faculty).map(r => ({
      ...r,
      facultyId: first(r, ['facultyId', 'faculty_id', 'id']),
      name: first(r, ['name', 'faculty_name'])
    })),
    courses,
    divisions: array(raw.divisions ?? raw.Division).map(r => ({
      ...r,
      divisionId: first(r, ['divisionId', 'division_id', 'id']),
      divisionName: first(r, ['divisionName', 'division_name', 'name'])
    })),
    rooms: array(raw.rooms ?? raw.Room).map(r => ({
      ...r,
      roomId: first(r, ['roomId', 'room_id', 'id']),
      roomName: first(r, ['roomName', 'room_name', 'name']),
      roomType: first(r, ['roomType', 'room_type'])
    })),
    courseFaculty: array(raw.courseFaculty ?? raw.Course_Faculty ?? raw.teaches),
    courseDivision: array(raw.courseDivision ?? raw.Course_Division ?? raw.offeredTo),
    facultyAvailability: array(raw.facultyAvailability),
    roomAvailability: array(raw.roomAvailability),
    constraints: { ...(raw.constraints || {}) }
  };
}
function validateNormalizedData(data) {
  const errors = [];
  const requiredArrays = ['faculty', 'courses', 'divisions', 'rooms', 'courseFaculty', 'courseDivision'];
  for (const key of requiredArrays) if (!Array.isArray(data[key])) errors.push(`${key} must be an array`);
  const courseIds = new Set();
  for (const course of data.courses || []) {
    const id = course.courseId;
    if (id == null) errors.push('Course is missing courseId');
    else if (courseIds.has(String(id))) errors.push(`Duplicate courseId ${id}`);
    else courseIds.add(String(id));
    if (!course.courseName) errors.push(`Course ${id ?? '(unknown)'} is missing courseName`);
    if (!Number.isFinite(course.credits) || course.credits <= 0) errors.push(`Course ${id ?? course.courseName} has invalid credits`);
    if (course.courseType === 'LAB' && !course.durationHours) errors.push(`Lab ${id} has unsupported credit value ${course.credits}; supported lab credits are 1, 1.5, 2 and 3`);
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { normalizeData, validateNormalizedData, LAB_DURATION_BY_CREDIT, normalizeCourseType };
