
const assert = require("node:assert");
const { isRoomAvailable } = require("../roomAvailabilityChecker");

const session = {
    id: "S1",
    roomId: "R1"
};

const roomAvailability = {
    R1: ["9-10 AM", "10-11 AM"],
    R2: ["11-12 PM"]
};

// Room R1 is available at 9-10 AM
assert.strictEqual(
    isRoomAvailable(session, "9-10 AM", roomAvailability),
    true
);

// Room R1 is not available at 11-12 PM
assert.strictEqual(
    isRoomAvailable(session, "11-12 PM", roomAvailability),
    false
);

console.log("All room availability tests passed!");
