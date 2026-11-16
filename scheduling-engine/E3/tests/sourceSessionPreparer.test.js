const assert = require("assert");
const { prepareSourceSessions } = require("../sourceSessionPreparer");
const data = require("../fixtures/cse_timetable_test_fixture.json");

const prepared = prepareSourceSessions(data);

assert.strictEqual(prepared.summary.totalSourceSessions, 225);
assert.strictEqual(prepared.summary.manualReview, 1);
assert.strictEqual(prepared.summary.reschedulingRequired, 1);
assert.strictEqual(prepared.summary.approvedExceptions, 2);

assert(
    prepared.manualReviewSessions.some(session => session.id === "TTG026"),
    "TTG026 should require manual review."
);

assert(
    !prepared.sessionsForScheduling.some(session => session.id === "TTG026"),
    "TTG026 must not enter automatic scheduling."
);

const ttg225 = prepared.sessionsForScheduling.find(
    session => session.id === "TTG225"
);

assert(ttg225, "TTG225 should be included for rescheduling.");
assert.strictEqual(ttg225.day, null);
assert.strictEqual(ttg225.slotId, null);
assert.deepStrictEqual(ttg225.originalAssignment, {
    day: "SAT",
    slotId: 51
});
assert.strictEqual(ttg225.facultyIds[0], 32);
assert.strictEqual(ttg225.roomId, 19);
assert.strictEqual(ttg225.divisionId, 6);

assert(
    prepared.approvedExceptionSessions.some(session => session.id === "TTG222")
);
assert(
    prepared.approvedExceptionSessions.some(session => session.id === "TTG223")
);

// Ensure the original fixture was not mutated.
assert.strictEqual(
    data.sessions.find(session => session.id === "TTG225").slotId,
    51
);

console.log("PASS: sourceSessionPreparer.test.js");
console.log(prepared.summary);
