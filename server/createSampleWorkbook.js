/**
 * Builds samples/ClassSync_sample_input.xlsx from the E3 example data.
 * Run: node createSampleWorkbook.js
 */
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');

const SAMPLE_PATH = path.join(__dirname, '..', 'samples', 'ClassSync_sample_input.xlsx');

function createSampleWorkbook() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scheduling-engine', 'E3', 'fixtures', 'academic_input_example.json'), 'utf8'));
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  add('Instructions', [
    { Sheet: 'Faculty', Required: 'Yes', Columns: 'faculty_id, faculty_name, max_hours_per_day (optional), max_hours_per_week (optional)' },
    { Sheet: 'Course', Required: 'Yes', Columns: 'course_id, course_name, course_type (Theory / Lab / Project), credits, faculty_per_session (optional)' },
    { Sheet: 'Room', Required: 'Yes', Columns: 'room_id, room_name, room_type (Classroom / Lab), capacity (optional)' },
    { Sheet: 'Course_Faculty', Required: 'Yes', Columns: 'course_id, faculty_id, division_batch (e.g. "A, B" or "A1") - which divisions/batches the teacher takes' },
    { Sheet: 'Division', Required: 'No', Columns: 'division_id, division_name, semester, batch_count (optional), student_count (optional). If missing, divisions A, B, C... are created from the number you enter.' },
    { Sheet: 'Course_Division', Required: 'No', Columns: 'course_id, division_id. If missing, every course is offered to every division.' },
    { Sheet: 'Rules', Required: '-', Columns: 'Theory: one 1-hour class per credit on different days. Labs: 1 credit = 1 h, 1.5-2 credits = 2 h, 3 credits = 3 h, run 08:00-12:00 in batches (A1, A2...). Periods: 08:00-17:45 with breaks and 12:30 lunch; Saturday 08:00-12:15.' }
  ]);
  add('Faculty', data.faculty.map(f => ({ faculty_id: f.faculty_id, faculty_name: f.faculty_name, designation: f.designation })));
  add('Course', data.courses.map(c => ({ course_id: c.course_id, course_name: c.course_name, course_type: c.course_type, credits: c.credits })));
  add('Division', data.divisions.map(d => ({ division_id: d.division_id, division_name: d.division_name, semester: d.semester })));
  add('Room', data.rooms.map(r => ({ room_id: r.room_id, room_name: r.room_name, room_type: r.room_type, location: r.location })));
  add('Course_Faculty', data.courseFaculty.map(r => ({ course_id: r.course_id, faculty_id: r.faculty_id, division_batch: r.division_batch })));
  add('Course_Division', data.courseDivision.map(r => ({ course_id: r.course_id, division_id: r.division_id })));

  fs.mkdirSync(path.dirname(SAMPLE_PATH), { recursive: true });
  XLSX.writeFile(wb, SAMPLE_PATH);
  return SAMPLE_PATH;
}

if (require.main === module) console.log('Sample workbook written to', createSampleWorkbook());

module.exports = { createSampleWorkbook, SAMPLE_PATH };
