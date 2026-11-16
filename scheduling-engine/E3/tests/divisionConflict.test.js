
const assert = require("node:assert");
const { generateTimetable } = require("../scheduler");

const sessions = [
    {
        id: "S1",
        facultyId: "F1",
        roomId: "R1",
        divisionId: "A",
        batchIds: []
    },
    {
        id: "S2",
        facultyId: "F2",
        roomId: "R2",
        divisionId: "A",
        batchIds: []
    }
];

const slots = ["9-10 AM", "10-11 AM"];

const result = generateTimetable(sessions, slots);

assert.strictEqual(result.success, true);

assert.notStrictEqual(
    result.assignments.get("S1"),
    result.assignments.get("S2")
);

console.log("Division assignments:", [...result.assignments]);
console.log("Division conflict tests passed!");
