
const assert = require("node:assert");
const { generateTimetable } = require("../scheduler");

const sessions = [
    {
        id: "S1",
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
    "4-5 PM",
    "5-6 PM"
];

const workingSlots = [
    "9-10 AM",
    "10-11 AM"
];

const result = generateTimetable(
    sessions,
    slots,
    null,
    null,
    [],
    workingSlots
);

assert.strictEqual(result.success, true);

assert.ok(
    workingSlots.includes(result.assignments.get("S1"))
);

console.log("Assigned slot:", result.assignments.get("S1"));
console.log("Working-hour integration tests passed!");
