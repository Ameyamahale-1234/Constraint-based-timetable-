const assert = require("assert");
const { prepareSourceSessions } = require("../sourceSessionPreparer");
const data = require("../fixtures/cse_timetable_test_fixture.json");

const prepared = prepareSourceSessions(data);

const scheduledIds = new Set(
    prepared.sessionsForScheduling.map(session => session.id)
);

assert(!scheduledIds.has("TTG026"), "TTG026 must be held for manual review.");
assert(scheduledIds.has("TTG225"), "TTG225 must be included for rescheduling.");
assert(scheduledIds.has("TTG222"), "Approved exception TTG222 must be retained.");
assert(scheduledIds.has("TTG223"), "Approved exception TTG223 must be retained.");

const ttg225 = prepared.sessionsForScheduling.find(
    session => session.id === "TTG225"
);

assert.strictEqual(ttg225.day, null);
assert.strictEqual(ttg225.slotId, null);
assert.deepStrictEqual(ttg225.originalAssignment, {
    day: "SAT",
    slotId: 51
});

console.log("PASS: sourcePreparationSchedulerIntegration.test.js");

