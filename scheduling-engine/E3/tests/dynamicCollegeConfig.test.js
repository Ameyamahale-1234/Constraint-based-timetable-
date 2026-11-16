
const assert = require("node:assert/strict");

const {
    getCollegeSlots,
    getConsecutiveSlotGroups
} = require("../collegeTimeConfig");

const custom = getCollegeSlots({
    workingDays: ["MON", "TUE", "SAT"],

    dayOverrides: {
        MON: {
            periods: [
                { start: "08:00", end: "09:00" },
                { start: "09:00", end: "10:00" },
                { start: "10:15", end: "11:15" }
            ]
        },

        TUE: {
            periods: [
                { start: "09:00", end: "10:00" },
                { start: "10:00", end: "11:00" }
            ]
        },

        SAT: {
            periods: [
                { start: "08:00", end: "09:00" }
            ]
        }
    },

    specialLabSlots: [
        {
            day: "MON",
            start: "13:30",
            end: "17:30",
            slotId: "MON-LAB-4H"
        }
    ]
});

assert.equal(
    custom.filter(s => s.day === "MON").length,
    4
);

assert.equal(
    custom.filter(s => s.day === "TUE").length,
    2
);

assert.equal(
    custom.filter(s => s.day === "SAT").length,
    1
);

assert.equal(
    getConsecutiveSlotGroups(custom, 4).length,
    1
);

assert.equal(
    getConsecutiveSlotGroups(custom, 2)
        .some(g => g.length === 2),
    true
);

console.log("Dynamic college configuration tests passed.");
