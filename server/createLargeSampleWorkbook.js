/**
 * Builds samples/ClassSync_large_sample_input.xlsx: a template with
 * 4 semesters (3, 4, 5, 6) x 6 divisions (A-F), fictional teachers, and every
 * optional column filled in, so colleges can copy its layout.
 * Run: node createLargeSampleWorkbook.js
 */
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');

const LARGE_SAMPLE_PATH = path.join(__dirname, '..', 'samples', 'ClassSync_large_sample_input.xlsx');
const DIVISIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Per semester: theory courses (credits) and labs (credits -> 1 credit = 1 h, 2 credits = 2 h).
const CURRICULUM = {
  3: {
    theory: [['Data Structures', 4], ['Discrete Mathematics', 3], ['Digital Electronics', 3], ['Object Oriented Programming', 3], ['Universal Human Values', 2]],
    labs: [['Data Structures Lab', 2], ['Digital Electronics Lab', 1], ['OOP Lab', 1]]
  },
  4: {
    theory: [['Design and Analysis of Algorithms', 4], ['Operating Systems', 3], ['Database Management Systems', 3], ['Computer Organization', 3], ['Probability and Statistics', 2]],
    labs: [['DBMS Lab', 2], ['Operating Systems Lab', 1], ['Algorithms Lab', 1]]
  },
  5: {
    theory: [['Computer Networks', 4], ['Software Engineering', 3], ['Theory of Computation', 3], ['Machine Learning', 3], ['Professional Ethics', 2]],
    labs: [['Computer Networks Lab', 2], ['Machine Learning Lab', 1], ['Software Engineering Lab', 1]]
  },
  6: {
    theory: [['Compiler Design', 4], ['Cloud Computing', 3], ['Artificial Intelligence', 3], ['Information Security', 3], ['Entrepreneurship', 2]],
    labs: [['Compiler Design Lab', 2], ['Cloud Computing Lab', 1], ['AI Lab', 1]]
  }
};

const FIRST = ['Asha', 'Rahul', 'Meera', 'Vikram', 'Sneha', 'Arjun', 'Kavya', 'Nikhil', 'Pooja', 'Rohan', 'Divya', 'Karan', 'Anita', 'Suresh', 'Lakshmi', 'Manoj'];
const LAST = ['Kulkarni', 'Patil', 'Deshpande', 'Rao', 'Hegde', 'Joshi', 'Naik', 'Shetty', 'Iyer', 'Kamath'];

function createLargeSampleWorkbook() {
  const faculty = [], courses = [], divisions = [], rooms = [], courseFaculty = [], courseDivision = [];
  let facultyId = 1, courseId = 1;
  const newTeacher = () => {
    const i = facultyId - 1;
    const title = i % 3 === 0 ? 'Dr.' : i % 3 === 1 ? 'Prof.' : 'Ms./Mr.';
    faculty.push({
      faculty_id: facultyId,
      faculty_name: `${title} ${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
      designation: ['Professor', 'Associate Professor', 'Assistant Professor'][i % 3],
      max_hours_per_day: 6,
      max_hours_per_week: 20
    });
    return facultyId++;
  };

  let divisionId = 1;
  const divisionIds = {};
  for (const semester of Object.keys(CURRICULUM)) {
    divisionIds[semester] = {};
    for (const name of DIVISIONS) {
      divisions.push({ division_id: divisionId, division_name: name, semester: Number(semester), student_count: 64, batch_count: 2 });
      divisionIds[semester][name] = divisionId++;
    }
  }

  // Each teacher takes one theory course for 2 divisions; lab teachers are
  // reused from the pool so most teachers have one theory + one lab load.
  const labTeachers = [];
  for (const [semester, plan] of Object.entries(CURRICULUM)) {
    for (const [name, credits] of plan.theory) {
      const id = courseId++;
      courses.push({ course_id: id, course_name: name, course_type: 'Theory', credits, semester: Number(semester) });
      for (let pair = 0; pair < DIVISIONS.length; pair += 2) {
        const teacher = newTeacher();
        labTeachers.push(teacher);
        courseFaculty.push({ course_id: id, faculty_id: teacher, division_batch: DIVISIONS.slice(pair, pair + 2).join(', ') });
      }
      for (const d of DIVISIONS) courseDivision.push({ course_id: id, division_id: divisionIds[semester][d] });
    }
  }
  let labTeacherIndex = 0;
  for (const [semester, plan] of Object.entries(CURRICULUM)) {
    for (const [name, credits] of plan.labs) {
      const id = courseId++;
      courses.push({ course_id: id, course_name: name, course_type: 'Lab', credits, semester: Number(semester) });
      for (let pair = 0; pair < DIVISIONS.length; pair += 2) {
        // Take a theory teacher from a different semester for this lab.
        const teacher = labTeachers[(labTeacherIndex++ * 7) % labTeachers.length];
        courseFaculty.push({ course_id: id, faculty_id: teacher, division_batch: DIVISIONS.slice(pair, pair + 2).join(', ') });
      }
      for (const d of DIVISIONS) courseDivision.push({ course_id: id, division_id: divisionIds[semester][d] });
    }
  }

  for (let i = 1; i <= 12; i++) rooms.push({ room_id: `CR${100 + i}`, room_name: `Classroom ${100 + i}`, room_type: 'Classroom', capacity: 70, location: i <= 6 ? 'Block A' : 'Block B' });
  for (let i = 1; i <= 12; i++) rooms.push({ room_id: `LAB${i}`, room_name: `Computer Lab ${i}`, room_type: 'Lab', capacity: 36, location: 'Lab Complex' });

  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  add('Instructions', [
    { Sheet: 'Faculty', Required: 'Yes', Columns: 'faculty_id, faculty_name, max_hours_per_day (optional), max_hours_per_week (optional)' },
    { Sheet: 'Course', Required: 'Yes', Columns: 'course_id, course_name, course_type (Theory / Lab / Project), credits. "semester" is for your reference only.' },
    { Sheet: 'Room', Required: 'Yes', Columns: 'room_id, room_name, room_type (Classroom / Lab), capacity (optional)' },
    { Sheet: 'Course_Faculty', Required: 'Yes', Columns: 'course_id, faculty_id, division_batch = the divisions this teacher takes for this course, e.g. "A, B". Every division of every course needs a teacher.' },
    { Sheet: 'Division', Required: 'No', Columns: 'division_id (unique), division_name (A, B ...), semester, student_count (optional), batch_count (optional, default 2)' },
    { Sheet: 'Course_Division', Required: 'No', Columns: 'course_id, division_id: which courses each division takes' },
    { Sheet: 'How to grow', Required: '-', Columns: 'New semester: add its divisions (Division), courses (Course), offerings (Course_Division) and teacher mappings (Course_Faculty). New division: add a Division row, Course_Division rows for its courses, and its name in Course_Faculty.division_batch. Add rooms if hours run short.' },
    { Sheet: 'This sample', Required: '-', Columns: `${Object.keys(CURRICULUM).length} semesters x ${DIVISIONS.length} divisions, ${courses.length} courses, ${faculty.length} teachers (fictional), ${rooms.length} rooms. Enter 6 as the number of divisions.` }
  ]);
  add('Faculty', faculty);
  add('Course', courses);
  add('Division', divisions);
  add('Room', rooms);
  add('Course_Faculty', courseFaculty);
  add('Course_Division', courseDivision);

  fs.mkdirSync(path.dirname(LARGE_SAMPLE_PATH), { recursive: true });
  XLSX.writeFile(wb, LARGE_SAMPLE_PATH);
  return LARGE_SAMPLE_PATH;
}

if (require.main === module) console.log('Large sample workbook written to', createLargeSampleWorkbook());

module.exports = { createLargeSampleWorkbook, LARGE_SAMPLE_PATH };
