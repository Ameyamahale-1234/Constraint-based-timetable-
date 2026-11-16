const data = require("./fixtures/cse_timetable_test_fixture.json");

const { generateTimetable } = require("./scheduler");
const { getCollegeSlots } = require("./collegeTimeConfig");

console.log("\n===== CLASSSYNC ACTUAL CSE SCHEDULING =====");

const result = generateTimetable(
    data.sessions,
    getCollegeSlots(),
    null,
    null,
    [],
    null,
    data
);

console.log("Success:", result.success);
console.log("Method:", result.method);
console.log("Scheduled sessions:", result.assignments?.size ?? 0);
console.log(
    "Manual review:",
    result.sourcePreparation?.manualReviewSessions.map(s => s.id)
);
console.log(
    "Rescheduling:",
    result.sourcePreparation?.reschedulingSessions.map(s => s.id)
);
console.log(
    "Approved exceptions:",
    result.sourcePreparation?.approvedExceptionSessions.map(s => s.id)
);

if (!result.success) {
    console.log("\nErrors:", result.errors);
    console.log("Conflict report:", result.conflictReport);
}