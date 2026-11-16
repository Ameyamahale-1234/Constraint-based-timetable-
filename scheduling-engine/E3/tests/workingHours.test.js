
const assert = require("node:assert");

const {
    isWithinWorkingHours,
    filterWorkingHours
} = require("../workingHours");

const workingSlots = [
    "9-10 AM",
    "10-11 AM",
    "11-12 PM",
    "12-1 PM",
    "2-3 PM",
    "3-4 PM"
];

assert.strictEqual(
    isWithinWorkingHours("9-10 AM", workingSlots),
    true
);

assert.strictEqual(
    isWithinWorkingHours("5-6 PM", workingSlots),
    false
);

const labs = [
    ["9-10 AM", "10-11 AM"],
    ["3-4 PM", "4-5 PM"]
];

const result = filterWorkingHours(labs, workingSlots);

assert.strictEqual(result.length, 1);

console.log("Valid lab slots:", result);
console.log("All working-hour tests passed!");
