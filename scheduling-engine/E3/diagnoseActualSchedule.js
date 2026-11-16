
const data = require("./fixtures/cse_timetable_test_fixture.json");

const { prepareSourceSessions } = require("./sourceSessionPreparer");
const { getCollegeSlots } = require("./collegeTimeConfig");
const { buildDomains } = require("./scheduler");

const prepared = prepareSourceSessions(data);
const sessions = prepared.sessionsForScheduling;
const slots = getCollegeSlots();

const domains = buildDomains(
    sessions,
    slots,
    null,
    null,
    [],
    null
);

const emptyDomains = [];
const domainSizes = [];

for (const session of sessions) {
    const candidates = domains.get(session.id) || [];

    domainSizes.push(candidates.length);

    if (candidates.length === 0) {
        emptyDomains.push({
            id: session.id,
            semester: session.semester,
            division: session.divisionName,
            course: session.courseId,
            batch: session.batch,
            facultyIds: session.facultyIds,
            roomId: session.roomId,
            isLab: session.isLab,
            durationHours: session.durationHours
        });
    }
}

console.log("\n===== SCHEDULING DIAGNOSTICS =====");

console.log("Prepared sessions:", sessions.length);
console.log("Available slots:", slots.length);

console.log(
    "Sessions with at least one candidate:",
    domainSizes.filter(size => size > 0).length
);

console.log("Sessions with zero candidates:", emptyDomains.length);

console.log("\n===== ZERO-DOMAIN SESSIONS =====");
console.table(emptyDomains);

console.log("\n===== DOMAIN SIZE SUMMARY =====");
console.log(
    "Minimum candidates:",
    Math.min(...domainSizes)
);

console.log(
    "Maximum candidates:",
    Math.max(...domainSizes)
);

console.log(
    "Average candidates:",
    (domainSizes.reduce((a, b) => a + b, 0) /
        domainSizes.length).toFixed(2)
);

console.log("\n===== APPROVED EXCEPTIONS =====");

for (const session of prepared.approvedExceptionSessions) {
    console.log({
        id: session.id,
        day: session.day,
        slotId: session.slotId,
        roomId: session.roomId,
        facultyIds: session.facultyIds
    });
}
