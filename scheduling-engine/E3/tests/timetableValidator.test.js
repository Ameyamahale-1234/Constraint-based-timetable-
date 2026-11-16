
const assert = require("node:assert");
const { validateTimetable } = require("../timetableValidator");

const sessions = [
    { id: "S1", facultyId: "F1", roomId: "R1", divisionId: "A", batchIds: [] },
    { id: "S2", facultyId: "F1", roomId: "R2", divisionId: "B", batchIds: [] }
];

const assignments = new Map([
    ["S1", "9-10 AM"],
    ["S2", "10-11 AM"]
]);

const result = validateTimetable(sessions, assignments);

console.log(result);

assert.strictEqual(result.valid, true);
assert.strictEqual(result.errors.length, 0);

console.log("All timetable validation tests passed!");
