
const assert = require("node:assert");
const { generateTimetable } = require("../scheduler");

const sessions = [
    {
        id: "LAB1",
        facultyId: "F1",
        roomId: "LAB",
        divisionId: "A",
        batchIds: [],
        type: "LAB",
        durationSlots: 2
    },
    {
        id: "THEORY1",
        facultyId: "F1",
        roomId: "R1",
        divisionId: "A",
        batchIds: [],
        type: "THEORY"
    }
];

const slots = [
    "9-10 AM",
    "10-11 AM",
    "11-12 PM"
];

const result = generateTimetable(sessions, slots);

assert.strictEqual(result.success, true);

const labAssignment = result.assignments.get("LAB1");
const theoryAssignment = result.assignments.get("THEORY1");

assert.strictEqual(Array.isArray(labAssignment), true);
assert.strictEqual(labAssignment.length, 2);
assert.strictEqual(theoryAssignment, "11-12 PM");

console.log("Lab assignment:", labAssignment);
console.log("Theory assignment:", theoryAssignment);
console.log("Lab integration tests passed!");
