
const assert = require("node:assert");
const { filterAllowedSlots } = require("../timeRestrictions");

const availableSlots = [
    "9-10 AM",
    "10-11 AM",
    "11-12 PM",
    "12-1 PM",
    "1-2 PM",
    "2-3 PM"
];

const blockedSlots = ["1-2 PM"];

const result = filterAllowedSlots(
    availableSlots,
    blockedSlots
);

console.log("Allowed slots:", result);

assert.strictEqual(result.includes("1-2 PM"), false);
assert.strictEqual(result.length, 5);

// Check multi-period lab assignments
const labOptions = [
    ["9-10 AM", "10-11 AM"],
    ["12-1 PM", "1-2 PM"],
    ["2-3 PM", "3-4 PM"]
];

const validLabs = filterAllowedSlots(
    labOptions,
    blockedSlots
);

assert.strictEqual(validLabs.length, 2);

console.log("All time restriction tests passed!");
