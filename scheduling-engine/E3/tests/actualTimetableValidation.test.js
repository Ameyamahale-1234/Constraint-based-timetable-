
const assert = require("node:assert");

const data = require("../fixtures/cse_timetable_test_fixture.json");

const {
    validateTimetable
} = require("../timetableValidator");

// Build a lookup using the actual college time-slot records.
const slotMap = new Map();

for (const slot of data.timeSlots) {
    slotMap.set(
        `${slot.day}-${slot.slotId}`,
        slot
    );
}

// Build assignments from the existing timetable.
const assignments = new Map();

let missingSlots = 0;
let invalidTimeSlots = 0;

for (const session of data.sessions) {
    const key = `${session.day}-${session.slotId}`;
    const slot = slotMap.get(key);

    if (!slot) {
        missingSlots++;
        continue;
    }

    assignments.set(session.id, slot);

    if (slot.slotType !== "Class Hour") {
        invalidTimeSlots++;
    }
}

// Validate existing timetable resource conflicts.
const validation = validateTimetable(
    data.sessions,
    assignments
);

// Count conflict categories.
const conflictCounts = {
    faculty: 0,
    room: 0,
    division: 0,
    batch: 0
};

for (const error of validation.errors) {
    if (error.includes("Faculty conflict")) {
        conflictCounts.faculty++;
    }

    if (error.includes("Room conflict")) {
        conflictCounts.room++;
    }

    if (error.includes("Full-division conflict")) {
        conflictCounts.division++;
    }

    if (error.includes("Laboratory batch conflict")) {
        conflictCounts.batch++;
    }
}

// Display actual-data validation report.
console.log("\n===== ACTUAL CSE TIMETABLE VALIDATION =====");

console.log("Department:", data.scope.department);
console.log("Semesters:", data.scope.semesters);
console.log("Divisions:", data.scope.divisions);

console.log("Timetable rows:", data.summary.sourceRows);
console.log("Grouped sessions:", data.sessions.length);

console.log("\n===== TIME SLOT CHECK =====");

console.log("Missing slots:", missingSlots);
console.log("Lunch/day-off assignments:", invalidTimeSlots);

console.log("\n===== RESOURCE CONFLICTS =====");

console.log("Faculty conflicts:", conflictCounts.faculty);
console.log("Room conflicts:", conflictCounts.room);
console.log("Division conflicts:", conflictCounts.division);
console.log("Batch conflicts:", conflictCounts.batch);

console.log("\n===== VALIDATION RESULT =====");

console.log("Valid:", validation.valid);
console.log("Total reported conflicts:", validation.errors.length);

// Show a few examples without printing the entire report.
console.log("\nFirst 10 reported issues:");

validation.errors.slice(0, 10).forEach(error => {
    console.log("-", error);
});

console.log("\n===== ACTUAL DATA TEST COMPLETED =====");

assert.strictEqual(
    assignments.size + missingSlots,
    data.sessions.length
);
