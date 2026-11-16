
function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function getLabSlots(availableSlots, duration) {
    const validSlots = [];

    // Only class-hour slots can be used.
    const classSlots = availableSlots
        .filter(slot =>
            slot.slotType === "Class Hour" ||
            slot.slot_type === "Class Hour"
        )
        .sort((a, b) => a.slotId - b.slotId);

    for (let i = 0; i <= classSlots.length - duration; i++) {
        const consecutiveSlots = classSlots.slice(i, i + duration);

        const sameDay = consecutiveSlots.every(
            slot => slot.day === consecutiveSlots[0].day
        );

        if (!sameDay) continue;

        let uninterrupted = true;

        for (let j = 0; j < consecutiveSlots.length - 1; j++) {
            const currentEnd = timeToMinutes(
                consecutiveSlots[j].endTime ??
                consecutiveSlots[j].end_time
            );

            const nextStart = timeToMinutes(
                consecutiveSlots[j + 1].startTime ??
                consecutiveSlots[j + 1].start_time
            );

            if (currentEnd !== nextStart) {
                uninterrupted = false;
                break;
            }
        }

        if (uninterrupted) {
            validSlots.push(consecutiveSlots);
        }
    }

    return validSlots;
}

module.exports = { getLabSlots };
