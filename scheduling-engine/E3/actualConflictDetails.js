
const data = require("./fixtures/cse_timetable_test_fixture.json");

const {
    getResourceConflicts
} = require("./graphBuilder");

const slotMap = new Map(
    data.timeSlots.map(slot => [
        `${slot.day}-${slot.slotId}`,
        slot
    ])
);

function getCourseName(id) {
    return data.courses[String(id)]?.courseName || `Course ${id}`;
}

function getRoomName(id) {
    return data.rooms[String(id)]?.roomName || `Room ${id}`;
}

const conflicts = [];

for (let i = 0; i < data.sessions.length; i++) {
    for (let j = i + 1; j < data.sessions.length; j++) {
        const a = data.sessions[i];
        const b = data.sessions[j];

        // Only compare sessions occupying the same actual slot.
        if (a.day !== b.day || a.slotId !== b.slotId) {
            continue;
        }

       const reasons = getResourceConflicts(a, b);

// Show every type of resource conflict.
if (reasons.length === 0) continue;

        const slot = slotMap.get(`${a.day}-${a.slotId}`);

        conflicts.push({
            session1: a.id,
            session2: b.id,
            semester1: a.semester,
            semester2: b.semester,
            division1: a.divisionName,
            division2: b.divisionName,
            course1: getCourseName(a.courseId),
            course2: getCourseName(b.courseId),
            faculty1: a.facultyIds,
            faculty2: b.facultyIds,
            room1: getRoomName(a.roomId),
            room2: getRoomName(b.roomId),
            batch1: a.batch,
            batch2: b.batch,
            day: a.day,
            slotId: a.slotId,
            startTime: slot?.startTime,
            endTime: slot?.endTime,
            reasons
        });
    }
}

console.log("\n===== ACTUAL CONFLICT DETAILS =====");
console.log("Total conflicting pairs:", conflicts.length);

conflicts.forEach((item, index) => {
    console.log(`\n--- Conflict ${index + 1} ---`);
    console.log(JSON.stringify(item, null, 2));
});

console.log("\n===== INVALID TIME SLOT ASSIGNMENTS =====");

for (const session of data.sessions) {
    const slot = slotMap.get(`${session.day}-${session.slotId}`);

    if (!slot || !String(slot.slotType).toLowerCase().includes("class")) {
        console.log({
            session: session.id,
            semester: session.semester,
            division: session.divisionName,
            course: getCourseName(session.courseId),
            batch: session.batch,
            day: session.day,
            slotId: session.slotId,
            slotType: slot?.slotType || "MISSING"
        });
    }

}

console.log("\n===== SOURCE RECORD VERIFICATION =====");

const inspectIds = [
    "TTG216",
    "TTG224",
    "TTG026",
    "TTG222",
    "TTG223",
    "TTG225"
];

for (const session of data.sessions) {
    if (inspectIds.includes(session.id)) {
        console.log({
            id: session.id,
            sourceTimetableIds: session.sourceTimetableIds,
            sourceText: session.sourceText,
            isFixed: session.isFixed,
            day: session.day,
            slotId: session.slotId,
            batch: session.batch
        });
    }
}
