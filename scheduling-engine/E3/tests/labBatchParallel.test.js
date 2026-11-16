
const assert = require("node:assert");
const { getResourceConflicts } = require("../graphBuilder");

const a1 = {
    id: "LAB_A1",
    facultyIds: ["F1"],
    roomId: "LAB1",
    divisionId: "A",
    batch: "A1"
};

const a2 = {
    id: "LAB_A2",
    facultyIds: ["F2"],
    roomId: "LAB2",
    divisionId: "A",
    batch: "A2"
};

const theory = {
    id: "THEORY_A",
    facultyIds: ["F3"],
    roomId: "R1",
    divisionId: "A",
    batch: "A(full)"
};

// A1 and A2 can run simultaneously.
assert.deepStrictEqual(
    getResourceConflicts(a1, a2),
    []
);

// A1 and A2 cannot use the same faculty.
const sameFaculty = {
    ...a2,
    facultyIds: ["F1"]
};

assert.ok(
    getResourceConflicts(a1, sameFaculty).includes("FACULTY")
);

// A1 and A2 cannot use the same room.
const sameRoom = {
    ...a2,
    roomId: "LAB1"
};

assert.ok(
    getResourceConflicts(a1, sameRoom).includes("ROOM")
);

// Full-division theory conflicts with A1.
assert.ok(
    getResourceConflicts(theory, a1).includes("DIVISION")
);

// Full-division theory conflicts with A2.
assert.ok(
    getResourceConflicts(theory, a2).includes("DIVISION")
);

console.log("All A1/A2 laboratory rules passed!");
