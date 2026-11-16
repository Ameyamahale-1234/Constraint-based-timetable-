
const data = require("./fixtures/cse_timetable_test_fixture.json");

const targetFaculty = [18, 33];

console.log("\n===== FACULTY 18 AND 33 =====");

for (const facultyId of targetFaculty) {
    console.log(`\n--- Faculty ${facultyId} ---`);

    const sessions = data.sessions.filter(session =>
        (session.facultyIds || []).includes(facultyId)
    );

    sessions.forEach(session => {
        console.log({
            id: session.id,
            semester: session.semester,
            division: session.divisionName,
            courseId: session.courseId,
            facultyIds: session.facultyIds,
            roomId: session.roomId,
            batch: session.batch,
            day: session.day,
            slotId: session.slotId
        });
    });
}

console.log("\n===== LAB SESSIONS MARKED FULL DIVISION =====");

const fullDivisionLabs = data.sessions.filter(session =>
    String(session.batch || "").includes("(full)") &&
    /lab/i.test(
        String(data.courses[String(session.courseId)]?.courseName || "")
    )
);

fullDivisionLabs.forEach(session => {
    console.log({
        id: session.id,
        semester: session.semester,
        division: session.divisionName,
        course: data.courses[String(session.courseId)]?.courseName,
        facultyIds: session.facultyIds,
        roomId: session.roomId,
        batch: session.batch,
        day: session.day,
        slotId: session.slotId
    });
});

console.log("\nTotal full-division lab sessions:", fullDivisionLabs.length);
