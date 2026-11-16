
function isFacultyAvailable(session, slot, facultyAvailability) {
    const availableSlots = facultyAvailability[session.facultyId];

    if (!availableSlots) {
        return false;
    }

    return availableSlots.includes(slot);
}

module.exports = { isFacultyAvailable };
