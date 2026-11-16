const fs = require('node:fs');
const path = require('node:path');
const { normalizeData, validateNormalizedData } = require('./data/dataNormalizer');
const { generateSessions } = require('./sessionGenerator');
const { generateTimetableFromData } = require('./resourceScheduler');
const { validateFinalTimetable } = require('./finalTimetableValidator');
const { getCollegeSlots, getLabWindowSlots } = require('./collegeTimeConfig');

const args = process.argv.slice(2);
const scheduleRequested = args.includes('--schedule');
const demoRequested = args.includes('--demo');
const suppliedPath = args.find(arg => !arg.startsWith('--'));
const inputPath = suppliedPath || (demoRequested ? path.join(__dirname, 'fixtures', 'academic_input_example.json') : null);
if (!inputPath) {
  console.error('Usage: node runGeneratedSchedule.js <academic-input.json> [--schedule]');
  console.error('Demo only: node runGeneratedSchedule.js --demo');
  console.error('The bundled academic_input_example.json is sample/test data, not authoritative college data.');
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error(`Academic input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const data = normalizeData(raw);
const validation = validateNormalizedData(data);
if (!validation.valid) {
  console.error('Academic input validation failed:');
  validation.errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

const sessions = generateSessions(data);
const theory = sessions.filter(s => s.courseType === 'THEORY' || s.courseType === 'PROJECT');
const labs = sessions.filter(s => s.courseType === 'LAB');
const byDuration = sessions.reduce((acc, session) => {
  const key = `${session.durationHours}h`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

console.log('\n===== CLASSSYNC E3 GENERATED SESSIONS =====');
console.log(`Academic input: ${inputPath}`);
console.log(`Courses: ${data.courses.length}`);
console.log(`Divisions: ${data.divisions.length}`);
console.log(`Faculty: ${data.faculty.length}`);
console.log(`Rooms: ${data.rooms.length}`);
console.log(`Generated weekly sessions: ${sessions.length}`);
console.log(`Theory/project sessions: ${theory.length}`);
console.log(`Lab batch sessions: ${labs.length}`);
console.log('Duration distribution:', byDuration);
console.log('Lab batches:', [...new Set(labs.map(s => s.batch))].sort().join(', ') || 'none');

const invalidLabs = labs.filter(s => ![1, 2, 3].includes(s.durationHours));
if (invalidLabs.length) {
  console.error('Invalid lab durations detected:', invalidLabs.map(s => s.id));
  process.exit(1);
}
console.log('Validation: PASS (no 4-hour labs; all lab durations are 1, 2 or 3 hours)');

if (scheduleRequested) {
  console.log('\nStarting full resource-aware scheduling. Large academic datasets may require substantial search time.');
  const result = generateTimetableFromData(data);
  console.log('Scheduling success:', result.success);
  console.log('Scheduling method:', result.method);
  console.log('Assigned sessions:', result.assignments?.size || 0);
  if (!result.assignments) {
    console.error('Scheduling failed; final validation cannot run.');
    console.error('Scheduling errors:', result.errors || []);
    process.exitCode = 2;
  } else {
    const classSlots = getCollegeSlots();
    const labSlots = getLabWindowSlots();
    const audit = validateFinalTimetable(sessions, result.assignments, {
      availableSlots: classSlots,
      allAvailableSlots: [...classSlots, ...labSlots],
      timeConfig: undefined,
      labWindow: { start: '08:00', end: '12:00' }
    });
    console.log('\n===== FINAL TIMETABLE VALIDATION =====');
    console.log('Total sessions:', audit.totalSessions);
    console.log('Assigned sessions:', audit.assignedSessions);
    console.log('Unassigned sessions:', audit.unassignedSessions);
    console.log('Faculty conflicts:', audit.conflicts.faculty);
    console.log('Room conflicts:', audit.conflicts.room);
    console.log('Division conflicts:', audit.conflicts.division);
    console.log('Batch conflicts:', audit.conflicts.batch);
    console.log('Time-rule violations:', audit.ruleViolations.time);
    console.log('Duration violations:', audit.ruleViolations.duration);
    console.log('Lab-window violations:', audit.ruleViolations.labWindow);
    console.log('Missing assignment/resource violations:', audit.ruleViolations.missingAssignmentsOrResources);
    console.log('Total validation errors:', audit.totalErrors);
    console.log('FINAL VALIDATION:', audit.valid ? 'PASS' : 'FAIL');
    if (!audit.valid) {
      console.error('First 50 validation errors:');
      audit.errors.slice(0, 50).forEach(error => console.error('-', error));
      process.exitCode = 3;
    }
  }
}
