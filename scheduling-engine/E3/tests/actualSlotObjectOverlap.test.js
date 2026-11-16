
const assert = require("node:assert");

const {
    hasOverlap,
    forwardChecking
} = require("../forwardChecking");

const slot1 = {
    day: "MON",
    slotId: 1,
    startTime: "8:00",
    endTime: "9:00"
};

const slot2 = {
    day: "MON",
    slotId: 2,
    startTime: "9:00",
    endTime: "10:00"
};

const equivalentSlot1 = {
    day: "MON",
    slotId: 1,
    startTime: "8:00",
    endTime: "9:00"
};

// Same actual slot, different object references.
assert.strictEqual(
    hasOverlap(slot1, equivalentSlot1),
    true
);

// Different slots.
assert.strictEqual(
    hasOverlap(slot1, slot2),
    false
);

// Overlapping slot groups.
assert.strictEqual(
    hasOverlap([slot1, slot2], equivalentSlot1),
    true
);

// Legacy string compatibility.
assert.strictEqual(
    hasOverlap("9-10 AM", "9-10 AM"),
    true
);

const graph = new Map([
    ["S1", [{ sessionId: "S2", reasons: ["FACULTY"] }]],
    ["S2", [{ sessionId: "S1", reasons: ["FACULTY"] }]]
]);

const domains = new Map([
    ["S1", [slot1]],
    ["S2", [equivalentSlot1, slot2]]
]);

const result = forwardChecking(
    graph,
    domains,
    "S1",
    slot1
);

assert.strictEqual(result.success, true);
assert.deepStrictEqual(
    result.domains.get("S2"),
    [slot2]
);

console.log("Actual slot object overlap tests passed!");
