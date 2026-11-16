
const assert = require("node:assert");

const { buildConflictGraph } = require("../graphBuilder");
const { backtracking } = require("../backtracking");

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

const graph = buildConflictGraph(sessions);

const domains = new Map(
    sessions.map(session => [session.id, [...slots]])
);

const result = backtracking(graph, domains);

console.log("\n===== BACKTRACKING RESULT =====");

assert.notStrictEqual(result, null);

for (const [session, slot] of result) {
    console.log(session, "->", slot);
}

// Verify conflicts
for (const [sessionId, edges] of graph) {
    for (const edge of edges) {
        assert.notStrictEqual(
            result.get(sessionId),
            result.get(edge.sessionId)
        );
    }
}

console.log("\nAll backtracking tests passed!");
