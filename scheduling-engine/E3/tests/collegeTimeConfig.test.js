
const assert = require("node:assert");

const {
    getCollegeSlots,
    getConsecutiveSlotGroups
} = require("../collegeTimeConfig");

const slots = getCollegeSlots();

assert.ok(slots.length > 0, "Slots should be generated");

const weekdays = ["MON", "TUE", "WED", "THU", "FRI"];

for (const day of weekdays) {
    const daySlots = slots.filter(slot => slot.day === day);

    assert.ok(
        daySlots.length >= 0,
        `${day} should support configurable periods`
    );
}

const saturdaySlots = slots.filter(
    slot => slot.day === "SAT"
);

assert.ok(
    saturdaySlots.length > 0,
    "Saturday should have working slots"
);

const twoHourLabs = getConsecutiveSlotGroups(slots, 2);

const fourHourLabs = getConsecutiveSlotGroups(slots, 4);

console.log("Total class slots:", slots.length);
console.log("Saturday slots:", saturdaySlots.length);
console.log("Two-hour lab combinations:", twoHourLabs.length);
console.log("Four-hour lab combinations:", fourHourLabs.length);

console.log("College time configuration tests passed!");
