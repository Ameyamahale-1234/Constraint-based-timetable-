
const assert = require("assert");

const {
    generateTimetable
} = require("../scheduler");

const {
    validateSourceData
} = require("../sourceDataValidator");

const data = require("../fixtures/cse_timetable_test_fixture.json");

// Test 1: Source validation identifies the expected issues.
const validation = validateSourceData(data);

assert.strictEqual(validation.totalSessions, 225);
assert.strictEqual(validation.totalIssues, 2);
assert.strictEqual(validation.totalManualReview, 1);
assert.strictEqual(validation.totalReschedulingRequired, 1);
assert.strictEqual(validation.totalApprovedExceptions, 2);

// Test 2: Fixed invalid source sessions stop scheduling.
const result = generateTimetable(
    [],
    ["9-10 AM"],
    null,
    null,
    [],
    null,
    data
);

assert.strictEqual(result.success, false);

assert(result.sourceValidation, "Source validation result is missing.");
assert(result.sourcePreparation, "Source preparation result is missing.");

assert.strictEqual(
    result.sourcePreparation.manualReviewSessions[0].id,
    "TTG026"
);

assert(
    result.sourcePreparation.reschedulingSessions.some(
        session => session.id === "TTG225"
    )
);
assert.strictEqual(result.assignments, null);
assert.strictEqual(
    result.sourceValidation.totalManualReview,
    1
);

console.log("PASS: Source validation integration tests");
