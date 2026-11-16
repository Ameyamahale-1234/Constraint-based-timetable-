
const assert = require("node:assert");
const { generateTimetable } = require("../scheduler");

const sessions = [
    {
        id: "S1",
        facultyId: "F1",
        roomId: "R1",
        divisionId: "A",
        batchIds: ["A1"]
    },
    {
        id: "S2",
        facultyId: "F2",
        roomId: "R2",
        divisionId: "A",
        batchIds: ["A1"]
    }
];

const slots = ["9-10 AM", "10-11 AM"];

const result = generateTimetable(sessions, slots);

assert.strictEqual(result.success, true);

// Same batch in the same division cannot overlap.
assert.notStrictEqual(
    result.assignments.get("S1"),
    result.assignments.get("S2")
);

console.log("Batch assignments:", [...result.assignments]);
console.log("Batch conflict tests passed!");
