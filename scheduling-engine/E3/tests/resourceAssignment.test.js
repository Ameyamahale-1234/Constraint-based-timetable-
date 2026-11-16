
const assert = require("node:assert/strict");

const {
    buildResourceGraph,
    solveResourceCsp
} = require("../resourceScheduler");

// Test time slot.
const slot = {
    day: "MON",
    slotId: 1
};

// Two independent theory sessions.
const sessions = [
    {
        id: "S1",
        divisionId: "A"
    },
    {
        id: "S2",
        divisionId: "B"
    }
];

// Both sessions could use F1 and the same classroom.
const facultyOptions = new Map([
    ["S1", ["F1", "F2"]],
    ["S2", ["F1", "F3"]]
]);

const roomOptions = new Map([
    ["S1", ["R1", "R2"]],
    ["S2", ["R1", "R3"]]
]);

const graph = buildResourceGraph(
    sessions,
    facultyOptions,
    roomOptions
);

// Test 1: A shared eligible resource creates a possible conflict edge.
assert.ok(
    graph.get("S1").some(edge =>
        edge.sessionId === "S2" &&
        edge.reasons.includes("FACULTY")
    ),
    "Shared eligible faculty should create a possible conflict edge"
);

// Test 2: Different faculty and rooms can use the same slot.
const independentDomains = new Map([
    ["S1", [
        {
            slots: [slot],
            facultyId: "F2",
            roomId: "R2"
        }
    ]],
    ["S2", [
        {
            slots: [slot],
            facultyId: "F3",
            roomId: "R3"
        }
    ]]
]);

const independentResult = solveResourceCsp(
    graph,
    independentDomains
);

assert.ok(
    independentResult,
    "Different faculty and rooms should allow simultaneous sessions"
);

// Test 3: Same faculty at the same time must conflict.
const facultyConflictDomains = new Map([
    ["S1", [
        {
            slots: [slot],
            facultyId: "F1",
            roomId: "R2"
        }
    ]],
    ["S2", [
        {
            slots: [slot],
            facultyId: "F1",
            roomId: "R3"
        }
    ]]
]);

const facultyConflictResult = solveResourceCsp(
    graph,
    facultyConflictDomains
);

assert.equal(
    facultyConflictResult,
    null,
    "The same faculty cannot teach two sessions simultaneously"
);

// Test 4: Same room at the same time must conflict.
const roomConflictDomains = new Map([
    ["S1", [
        {
            slots: [slot],
            facultyId: "F2",
            roomId: "R1"
        }
    ]],
    ["S2", [
        {
            slots: [slot],
            facultyId: "F3",
            roomId: "R1"
        }
    ]]
]);

const roomConflictResult = solveResourceCsp(
    graph,
    roomConflictDomains
);

assert.equal(
    roomConflictResult,
    null,
    "The same room cannot host two sessions simultaneously"
);

console.log("PASS: Shared eligible resources detected");
console.log("PASS: Different faculty and rooms can run simultaneously");
console.log("PASS: Faculty conflicts prevented");
console.log("PASS: Room conflicts prevented");
console.log("All resource assignment tests passed!");
