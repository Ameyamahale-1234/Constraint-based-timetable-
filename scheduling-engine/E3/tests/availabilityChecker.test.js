
const assert = require("node:assert");
const { isFacultyAvailable } = require("../availabilityChecker");

const session = {
    id: "S1",
    facultyId: "F1"
};

const facultyAvailability = {
    F1: ["9-10 AM", "11-12 PM"],
    F2: ["10-11 AM"]
};

assert.strictEqual(
    isFacultyAvailable(session, "9-10 AM", facultyAvailability),
    true
);

assert.strictEqual(
    isFacultyAvailable(session, "10-11 AM", facultyAvailability),
    false
);

console.log("All faculty availability tests passed!");
