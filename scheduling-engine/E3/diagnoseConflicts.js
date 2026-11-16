
const data = require("./fixtures/cse_timetable_test_fixture.json");

const { prepareSourceSessions } = require("./sourceSessionPreparer");
const { buildConflictGraph } = require("./graphBuilder");
const { getCollegeSlots } = require("./collegeTimeConfig");

const prepared = prepareSourceSessions(data);
const sessions = prepared.sessionsForScheduling;

const graph = buildConflictGraph(sessions);

console.log("\n===== CONFLICT GRAPH DIAGNOSTICS =====");

const degrees = sessions.map(session => ({
    id: session.id,
    division: session.divisionName,
    semester: session.semester,
    facultyIds: session.facultyIds,
    roomId: session.roomId,
    batch: session.batch,
    conflicts: (graph.get(session.id) || []).length
}));

degrees.sort((a, b) => b.conflicts - a.conflicts);

console.log("\nTop 15 sessions by conflict count:");
console.table(degrees.slice(0, 15));

console.log("\n===== APPROVED SESSION DETAILS =====");

for (const id of ["TTG222", "TTG223"]) {
    const session = sessions.find(s => s.id === id);

    console.log(id, session || "NOT FOUND");
}

console.log("\n===== APPROVED SESSION CONFLICT =====");

const a = sessions.find(s => s.id === "TTG222");
const b = sessions.find(s => s.id === "TTG223");

if (a && b) {
    console.log({
        sameRoom: a.roomId === b.roomId,
        sameFaculty: JSON.stringify(a.facultyIds) === JSON.stringify(b.facultyIds),
        sameDivision: a.divisionId === b.divisionId,
        batchA: a.batch,
        batchB: b.batch,
        graphEdge: (graph.get(a.id) || []).find(
            edge => edge.sessionId === b.id
        )
    });
}

console.log("\n===== AVAILABLE SLOT FORMAT =====");
console.log(getCollegeSlots().slice(0, 5));
