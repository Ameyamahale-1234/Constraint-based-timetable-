
function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function getLabSlots(availableSlots, duration) {
    const validSlots = [];

    if (!Array.isArray(availableSlots) || duration <= 0) {
        return validSlots;
    }

    // Backward compatibility: simple time-slot strings.
    if (availableSlots.every(slot => typeof slot === "string")) {
        for (let i = 0; i <= availableSlots.length - duration; i++) {
            validSlots.push(
                availableSlots.slice(i, i + duration)
            );
        }

        return validSlots;
    }

    // Actual college time-slot objects.
    const classSlots = availableSlots
        .filter(slot =>
            (slot.slotType ?? slot.slot_type) === "Class Hour"
        )
        .sort((a, b) => {
            const dayCompare = String(a.day).localeCompare(String(b.day));
            return dayCompare || a.slotId - b.slotId;
        });

    // Check each day separately.
    const days = [...new Set(classSlots.map(slot => slot.day))];

    for (const day of days) {
        const daySlots = classSlots.filter(slot => slot.day === day);

        for (let i = 0; i <= daySlots.length - duration; i++) {
            const group = daySlots.slice(i, i + duration);

            let uninterrupted = true;

            for (let j = 0; j < group.length - 1; j++) {
                const currentEnd = timeToMinutes(
                    group[j].endTime ?? group[j].end_time
                );

                const nextStart = timeToMinutes(
                    group[j + 1].startTime ?? group[j + 1].start_time
                );

                if (currentEnd !== nextStart) {
                    uninterrupted = false;
                    break;
                }
            }

            if (uninterrupted) {
                validSlots.push(group);
            }
        }
    }

    return validSlots;
}

module.exports = { getLabSlots };
