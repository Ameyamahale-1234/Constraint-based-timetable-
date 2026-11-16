
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
        facultyId: "F1",
        roomId: "R2",
        divisionId: "B",
        batchIds: []
    },
    {
        id: "S3",
        facultyId: "F2",
        roomId: "R1",
        divisionId: "C",
        batchIds: []
    }
];

const slots = ["9-10 AM", "10-11 AM"];

const result = generateTimetable(sessions, slots);

console.log("Scheduling method:", result.method);
console.log("Timetable:");

for (const [sessionId, slot] of result.assignments) {
    console.log(sessionId, "->", slot);
}

assert.strictEqual(result.success, true);
assert.strictEqual(result.assignments.size, 3);

console.log("\nAll scheduler tests passed!");
