
const assert = require("node:assert/strict");
const { backtracking } = require("../backtracking");

const slot1 = {
    day: "MON",
    slotId: "S1"
};

const slot2 = {
    day: "MON",
    slotId: "S2"
};

// Test 1: Scheduler should find a valid solution.
const graph = new Map([
    ["A", [{ sessionId: "B", reasons: ["FACULTY"] }]],
    ["B", [{ sessionId: "A", reasons: ["FACULTY"] }]]
]);

const domains = new Map([
    ["A", [slot1]],
    ["B", [slot1, slot2]]
]);

const result = backtracking(graph, domains);

assert.notEqual(result, null, "A valid schedule should be found");

assert.deepStrictEqual(result.get("A"), slot1);
assert.deepStrictEqual(result.get("B"), slot2);

console.log("PASS: Backtracking finds a valid object-based schedule.");

// Test 2: Scheduler should reject an impossible schedule.
const impossibleDomains = new Map([
    ["A", [slot1]],
    ["B", [slot1]]
]);

const impossibleResult = backtracking(graph, impossibleDomains);

assert.equal(
    impossibleResult,
    null,
    "No solution should exist when both conflicting sessions have only the same slot"
);

console.log("PASS: Backtracking rejects an impossible schedule.");

console.log("All backtracking-forward-checking tests passed!");
