
const assert = require("assert");

const data = require("../fixtures/cse_timetable_test_fixture.json");

function runActualDataTests() {
    console.log("\n--- Actual College Data Tests ---");

    // Test 1: Department scope
    assert.strictEqual(data.scope.department, "CSE");
    console.log("PASS: CSE department");

    // Test 2: Semester coverage
    assert.deepStrictEqual(data.scope.semesters, [4, 6]);
    console.log("PASS: Semester coverage");

    // Test 3: All five divisions
    assert.deepStrictEqual(
        data.scope.divisions,
        ["A", "B", "C", "D", "E"]
    );
    console.log("PASS: Division coverage");

    // Test 4: All grouped sessions
    assert.strictEqual(data.sessions.length, 225);
    console.log("PASS: 225 grouped sessions");

    // Test 5: Multi-faculty sessions
    const multiFaculty = data.sessions.filter(
        session => session.facultyIds.length > 1
    );

    assert.strictEqual(multiFaculty.length, 75);
    console.log("PASS: Multi-faculty assignments");

    // Test 6: Required session information
    for (const session of data.sessions) {
        assert.ok(session.id);
        assert.ok(session.divisionId);
        assert.ok(session.courseId);
        assert.ok(session.roomId);
        assert.ok(session.slotId);
        assert.ok(session.day);
        assert.ok(session.facultyIds.length > 0);
    }

    console.log("PASS: Required session information");

    console.log("\nAll actual-data integration checks passed.");
}

runActualDataTests();
