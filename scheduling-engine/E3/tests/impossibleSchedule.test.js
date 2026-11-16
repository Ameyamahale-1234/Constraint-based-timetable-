
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
        facultyId: "F1",
        roomId: "R3",
        divisionId: "C",
        batchIds: []
    }
];

// Only one available time slot
const slots = ["9-10 AM"];

// Generate timetable
const result = generateTimetable(sessions, slots);

// Verify impossible scheduling
assert.strictEqual(result.success, false);
assert.strictEqual(result.assignments, null);

// Verify conflict report
assert.ok(result.conflictReport);
assert.ok(result.conflictReport.totalConflicts > 0);

// Verify resource conflicts are reported
assert.ok(
    result.conflictReport.conflicts.some(
        conflict => conflict.type === "RESOURCE_CONFLICT"
    )
);

// Display conflict report
console.log(
    "\n===== CONFLICT REPORT ====="
);

console.log(
    JSON.stringify(result.conflictReport, null, 2)
);

// Display complete scheduling result
console.log(
    "\n===== SCHEDULING RESULT ====="
);

console.log(
    JSON.stringify(result, null, 2)
);

console.log("\nImpossible scheduling tests passed!");

