
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
        divisionId: "B",
        batchIds: []
    }
];

const slots = ["9-10 AM", "10-11 AM"];

const facultyAvailability = {
    F1: ["10-11 AM"],
    F2: ["9-10 AM"]
};

const result = generateTimetable(
    sessions,
    slots,
    facultyAvailability
);

assert.strictEqual(result.success, true);
assert.strictEqual(result.assignments.get("S1"), "10-11 AM");
assert.strictEqual(result.assignments.get("S2"), "9-10 AM");

console.log("Method:", result.method);
console.log("Timetable:", [...result.assignments]);
console.log("Faculty scheduling tests passed!");
