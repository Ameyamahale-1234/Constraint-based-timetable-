
const { buildConflictGraph } = require("../graphBuilder");

// Sample timetable sessions
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

// Build conflict graph
const graph = buildConflictGraph(sessions);

// Display graph
console.log("\n===== E3 CONFLICT GRAPH =====");

for (const [id, edges] of graph) {
    console.log(id, "->", edges);
}

// Verify results
console.assert(graph.get("S1").length === 2);
console.assert(graph.get("S2").length === 1);
console.assert(graph.get("S3").length === 1);

console.log("\nAll graph tests passed!");
