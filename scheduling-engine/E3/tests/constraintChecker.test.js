
const assert = require("node:assert");

const {
    checkConstraints
} = require("../constraintChecker");

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
    }
];

const assignments = new Map([
    ["S1", "9-10 AM"]
]);

const result = checkConstraints(
    sessions[1],
    "9-10 AM",
    sessions,
    assignments
);

console.log("\n===== CONSTRAINT CHECK =====");

console.log(result);

assert.strictEqual(result.valid, false);

assert.strictEqual(
    result.conflicts[0].reason,
    "FACULTY CONFLICT"
);

console.log("\nAll constraint tests passed!");
