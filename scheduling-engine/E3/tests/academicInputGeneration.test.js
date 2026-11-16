const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeData, validateNormalizedData } = require('../data/dataNormalizer');
const { generateSessions } = require('../sessionGenerator');

const inputPath = path.join(__dirname, '..', 'fixtures', 'academic_input_example.json');
const data = normalizeData(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
const validation = validateNormalizedData(data);
assert.equal(validation.valid, true, validation.errors.join('\n'));
const sessions = generateSessions(data);
assert.ok(sessions.length > 0);
assert.ok(sessions.every(s => s.courseId != null && s.divisionId != null && s.durationHours > 0));
const labs = sessions.filter(s => s.courseType === 'LAB');
assert.ok(labs.length > 0);
assert.ok(labs.every(s => ['A1', 'A2'].includes(s.batch)));
assert.ok(labs.every(s => [1, 2, 3].includes(s.durationHours)));
assert.ok(!labs.some(s => s.durationHours === 4));
const theory = sessions.filter(s => s.courseType === 'THEORY');
for (const course of data.courses.filter(c => String(c.courseType).toUpperCase() === 'THEORY')) {
  const offerings = data.courseDivision.filter(o => String(o.course_id) === String(course.courseId));
  for (const offering of offerings) {
    const count = theory.filter(s => String(s.courseId) === String(course.courseId) && String(s.divisionId) === String(offering.division_id)).length;
    assert.equal(count, Number(course.credits));
  }
}
console.log(`Academic-input generation test passed: ${sessions.length} fresh sessions generated from master data.`);
