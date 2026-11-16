
function checkConstraints(session, slot, sessions, assignments) {

    const conflicts = [];

    for (const other of sessions) {

        // Skip the same session
        if (other.id === session.id) continue;

        // Check only already scheduled sessions
        if (assignments.get(other.id) !== slot) continue;

        // Faculty conflict
        if (session.facultyId === other.facultyId) {
            conflicts.push({
                sessionId: other.id,
                reason: "FACULTY CONFLICT"
            });
        }

        // Room conflict
        if (session.roomId === other.roomId) {
            conflicts.push({
                sessionId: other.id,
                reason: "ROOM CONFLICT"
            });
        }

        // Division conflict
        if (session.divisionId === other.divisionId) {
            conflicts.push({
                sessionId: other.id,
                reason: "DIVISION CONFLICT"
            });
        }

        // Batch conflict
        const sharedBatches = (session.batchIds || []).filter(
            batch => (other.batchIds || []).includes(batch)
        );

        if (sharedBatches.length > 0) {
            conflicts.push({
                sessionId: other.id,
                reason: "BATCH CONFLICT"
            });
        }
    }

    return {
        valid: conflicts.length === 0,
        conflicts
    };
}

module.exports = { checkConstraints };
