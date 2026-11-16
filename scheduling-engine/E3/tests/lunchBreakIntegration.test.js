
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
    "11-12 PM",
    "12-1 PM",
    "1-2 PM",
    "2-3 PM"
];

const blockedSlots = ["1-2 PM"];

const result = generateTimetable(
    sessions,
    slots,
    null,
    null,
    blockedSlots
);

assert.strictEqual(result.success, true);
assert.notStrictEqual(
    result.assignments.get("S1"),
    "1-2 PM"
);

console.log("Assigned slot:", result.assignments.get("S1"));
console.log("Lunch break integration tests passed!");
