
const assert = require("node:assert");

const { buildConflictGraph } = require("../graphBuilder");
const { forwardChecking } = require("../forwardChecking");

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

const graph = buildConflictGraph(sessions);

const domains = new Map([
    ["S1", ["9-10 AM", "10-11 AM"]],
    ["S2", ["9-10 AM", "10-11 AM"]],
    ["S3", ["9-10 AM", "10-11 AM"]]
]);

const result = forwardChecking(
    graph,
    domains,
    "S1",
    "9-10 AM"
);

console.log("\n===== FORWARD CHECKING RESULT =====");

for (const [session, slots] of result.domains) {
    console.log(session, "->", slots);
}

assert.strictEqual(result.success, true);
assert.deepStrictEqual(
    result.domains.get("S2"),
    ["10-11 AM"]
);
assert.deepStrictEqual(
    result.domains.get("S3"),
    ["10-11 AM"]
);

console.log("\nAll forward checking tests passed!");

const { hasOverlap } = require("../forwardChecking");

assert.strictEqual(
    hasOverlap(["9-10 AM", "10-11 AM"], "10-11 AM"),
    true
);

assert.strictEqual(
    hasOverlap(["9-10 AM", "10-11 AM"], "11-12 PM"),
    false
);

console.log("Lab slot overlap tests passed!");
