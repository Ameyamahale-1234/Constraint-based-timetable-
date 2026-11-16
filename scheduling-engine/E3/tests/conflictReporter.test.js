
const assert = require("node:assert");

const { buildConflictGraph } = require("../graphBuilder");
const { generateConflictReport } = require("../conflictReporter");

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
        roomId: "R3",
        divisionId: "C",
        batchIds: []
    }
];

const graph = buildConflictGraph(sessions);

const domains = new Map([
    ["S1", ["9-10 AM"]],
    ["S2", []],
    ["S3", ["10-11 AM"]]
]);

const report = generateConflictReport(
    sessions,
    graph,
    domains
);

console.log("Conflict report:", report);

assert.strictEqual(
    report.conflicts.some(
        conflict => conflict.sessionId === "S2" &&
                    conflict.type === "NO_AVAILABLE_SLOTS"
    ),
    true
);

console.log("All conflict reporting tests passed!");
