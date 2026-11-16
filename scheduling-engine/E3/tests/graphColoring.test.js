
const assert = require("node:assert");
const { buildConflictGraph } = require("../graphBuilder");
const { graphColoring } = require("../graphColoring");

const sessions = [
    {
        id: "S1",
        facultyId: "F1",
        roomId: "R1",
        divisionId: "A"
    },
    {
        id: "S2",
        facultyId: "F1",
        roomId: "R2",
        divisionId: "B"
    },
    {
        id: "S3",
        facultyId: "F2",
        roomId: "R1",
        divisionId: "C"
    }
];

const slots = ["9-10 AM", "10-11 AM"];

const graph = buildConflictGraph(sessions);

const result = graphColoring(graph, slots);

assert.strictEqual(result.success, true);

assert.notStrictEqual(
    result.assignments.get("S1"),
    result.assignments.get("S2")
);

assert.notStrictEqual(
    result.assignments.get("S1"),
    result.assignments.get("S3")
);

console.log("\n===== GRAPH COLORING RESULT =====");

for (const [session, slot] of result.assignments) {
    console.log(session, "->", slot);
}

console.log("\nAll graph coloring tests passed!");
