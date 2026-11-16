
function isRoomAvailable(session, slot, roomAvailability) {
    const availableSlots = roomAvailability[session.roomId];

    if (!availableSlots) {
        return false;
    }

    return availableSlots.includes(slot);
}

module.exports = { isRoomAvailable };
