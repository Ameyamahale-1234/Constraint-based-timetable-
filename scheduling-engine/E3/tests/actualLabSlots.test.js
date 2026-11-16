
const assert = require("node:assert");

const data = require("../fixtures/cse_timetable_test_fixture.json");
const { getLabSlots } = require("../labScheduler");

const actualSlots = data.timeSlots;

const twoHourLabs = getLabSlots(actualSlots, 2);
const fourHourLabs = getLabSlots(actualSlots, 4);

console.log("\n===== ACTUAL EXCEL LAB SLOT VALIDATION =====");

console.log("Total Excel time slots:", actualSlots.length);
console.log("Two-hour lab combinations:", twoHourLabs.length);
console.log("Four-hour lab combinations:", fourHourLabs.length);

// Every combination must contain only class-hour slots.
for (const group of [...twoHourLabs, ...fourHourLabs]) {
    assert.ok(group.every(slot => slot.slotType === "Class Hour"));

    // All slots must belong to the same day.
    assert.ok(group.every(slot => slot.day === group[0].day));

    // Every consecutive slot must be uninterrupted.
    for (let i = 0; i < group.length - 1; i++) {
        assert.strictEqual(
            group[i].endTime,
            group[i + 1].startTime
        );
    }
}

console.log("All actual Excel lab-slot checks passed!");
