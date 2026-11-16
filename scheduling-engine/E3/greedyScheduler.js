
function greedySchedule(graph, sessions, availableSlots) {

    const assignedSlots = new Map();

    // Schedule sessions one by one
    for (const session of sessions) {

        let assigned = false;

        // Try each available time slot
        for (const slot of availableSlots) {

            let conflictFound = false;

            // Check already scheduled neighbouring sessions
            for (const edge of graph.get(session.id)) {

                if (assignedSlots.get(edge.sessionId) === slot) {
                    conflictFound = true;
                    break;
                }
            }

            // Assign slot if no conflict exists
            if (!conflictFound) {
                assignedSlots.set(session.id, slot);
                assigned = true;
                break;
            }
        }

        // No available slot found
        if (!assigned) {
            console.log("Unable to schedule:", session.id);
            return null;
        }
    }

    return assignedSlots;
}

module.exports = { greedySchedule };
