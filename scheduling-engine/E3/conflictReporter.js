
function generateConflictReport(sessions, graph, domains) {
    const conflicts = [];

    for (const session of sessions) {
        const availableSlots = domains.get(session.id) || [];

        // Identify sessions with no available slots
        if (availableSlots.length === 0) {
            conflicts.push({
                sessionId: session.id,
                type: "NO_AVAILABLE_SLOTS",
                message: `No available time slots for ${session.id}`
            });
        }
    }

    // Include related resource conflicts
    for (const [sessionId, edges] of graph) {
        for (const edge of edges) {
            if (sessionId < edge.sessionId) {
                conflicts.push({
                    sessionId,
                    relatedSession: edge.sessionId,
                    type: "RESOURCE_CONFLICT",
                    reasons: edge.reasons
                });
            }
        }
    }

    return {
        totalConflicts: conflicts.length,
        conflicts
    };
}

module.exports = { generateConflictReport };
