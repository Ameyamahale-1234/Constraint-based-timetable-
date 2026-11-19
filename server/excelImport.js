/**
 * Turns an uploaded Excel workbook into the raw academic data the E3 engine
 * expects, and applies the "number of divisions" the user asked for.
 *
 * Required sheets (names are matched loosely, case/spaces/underscores ignored):
 *   Faculty, Course, Room, Course_Faculty
 * Optional sheets:
 *   Division         - if missing, divisions A, B, C ... are created
 *   Course_Division  - if missing, every course is offered to every division
 *   Faculty_Availability, Fixed_Assignments
 */
const XLSX = require('xlsx');

const SHEETS = {
  faculty: { label: 'Faculty', required: true, names: ['faculty', 'teachers', 'staff'] },
  courses: { label: 'Course', required: true, names: ['course', 'courses', 'subject', 'subjects'] },
  rooms: { label: 'Room', required: true, names: ['room', 'rooms', 'classrooms'] },
  courseFaculty: { label: 'Course_Faculty', required: true, names: ['coursefaculty', 'coursefacultyteaches', 'teaches', 'facultycourse', 'subjectfaculty'] },
  divisions: { label: 'Division', required: false, names: ['division', 'divisions', 'classes'] },
  courseDivision: { label: 'Course_Division', required: false, names: ['coursedivision', 'coursedivisionofferedto', 'offeredto', 'divisioncourse'] },
  department: { label: 'Department', required: false, names: ['department', 'departments'] },
  facultyAvailability: { label: 'Faculty_Availability', required: false, names: ['facultyavailability', 'availability'] },
  fixedAssignments: { label: 'Fixed_Assignments', required: false, names: ['fixedassignments', 'fixed'] }
};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function key(name) { return String(name).toLowerCase().replace(/[^a-z]/g, ''); }
function cell(row, names) { for (const n of names) if (row[n] != null && row[n] !== '') return row[n]; return null; }

function readWorkbook(buffer) {
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'buffer' }); }
  catch (error) { throw new UserError(`The file could not be read as an Excel workbook (${error.message}).`); }
  const raw = {};
  const found = {};
  const missing = [];
  for (const [field, spec] of Object.entries(SHEETS)) {
    const sheetName = workbook.SheetNames.find(name => spec.names.includes(key(name)));
    if (!sheetName) { if (spec.required) missing.push(spec.label); raw[field] = []; continue; }
    found[field] = sheetName;
    raw[field] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null })
      .filter(row => Object.values(row).some(v => v !== null && v !== ''));
  }
  if (missing.length) {
    throw new UserError(`The workbook is missing required sheet(s): ${missing.join(', ')}. Found sheets: ${workbook.SheetNames.join(', ')}. Download the sample workbook to see the expected layout.`);
  }
  return { raw, found, sheetNames: workbook.SheetNames };
}

/**
 * Keep the requested number of divisions.
 * - With a Division sheet: the first N divisions of each semester (sheet order).
 * - Without one: create divisions A..N; courses are offered to all of them
 *   unless a Course_Division sheet names divisions.
 */
function applyDivisionCount(raw, count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 26) throw new UserError('Number of divisions must be a whole number between 1 and 26.');
  const notes = [];

  if (raw.divisions.length) {
    const bySemester = new Map();
    for (const d of raw.divisions) {
      const sem = cell(d, ['semester', 'sem', 'Semester']) ?? 'all';
      if (!bySemester.has(sem)) bySemester.set(sem, []);
      bySemester.get(sem).push(d);
    }
    const kept = [];
    for (const [sem, list] of bySemester) {
      const take = list.slice(0, n);
      if (list.length < n) notes.push(`Semester ${sem} has only ${list.length} division(s) in the Division sheet; all of them are scheduled.`);
      kept.push(...take);
    }
    const keptIds = new Set(kept.map(d => String(cell(d, ['division_id', 'divisionId', 'id']))));
    raw.divisions = kept;
    raw.courseDivision = raw.courseDivision.filter(r => keptIds.has(String(cell(r, ['division_id', 'divisionId']))));
    return { divisions: kept.map(d => ({ id: String(cell(d, ['division_id', 'divisionId', 'id'])), name: String(cell(d, ['division_name', 'divisionName', 'name'])), semester: cell(d, ['semester', 'sem']) })), notes };
  }

  // No Division sheet: create A, B, C ...
  raw.divisions = Array.from({ length: n }, (_, i) => ({ division_id: LETTERS[i], division_name: LETTERS[i] }));
  const byName = new Map(raw.divisions.map(d => [d.division_name, d.division_id]));
  if (raw.courseDivision.length) {
    raw.courseDivision = raw.courseDivision.map(r => {
      const ref = String(cell(r, ['division_id', 'divisionId', 'division_name', 'division']) ?? '').trim().toUpperCase();
      return byName.has(ref) ? { course_id: cell(r, ['course_id', 'courseId']), division_id: byName.get(ref) } : null;
    }).filter(Boolean);
  } else {
    raw.courseDivision = raw.courses.flatMap(c => raw.divisions.map(d => ({ course_id: cell(c, ['course_id', 'courseId', 'id']), division_id: d.division_id })));
    notes.push(`No Course_Division sheet: every course is offered to all ${n} division(s).`);
  }
  notes.push(`No Division sheet: created divisions ${raw.divisions.map(d => d.division_name).join(', ')}.`);
  return { divisions: raw.divisions.map(d => ({ id: d.division_id, name: d.division_name, semester: null })), notes };
}

class UserError extends Error {}

module.exports = { readWorkbook, applyDivisionCount, UserError, SHEETS };
