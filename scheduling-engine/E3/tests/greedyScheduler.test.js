
const { buildConflictGraph } = require("../graphBuilder");
const { greedySchedule } = require("../greedyScheduler");
const assert = require("node:assert");

// Sample sessions
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

// Available time slots
const slots = ["9-10 AM", "10-11 AM", "11-12 PM"];

// Build graph
const graph = buildConflictGraph(sessions);

// Run greedy scheduler
const result = greedySchedule(graph, sessions, slots);

// Verify scheduling
assert.notStrictEqual(result, null);

assert.notStrictEqual(
    result.get("S1"),
    result.get("S2")
);

assert.notStrictEqual(
    result.get("S1"),
    result.get("S3")
);

console.log("\n===== GREEDY SCHEDULING RESULT =====");

for (const [session, slot] of result) {
    console.log(session, "->", slot);
}

console.log("\nAll greedy scheduling tests passed!");
