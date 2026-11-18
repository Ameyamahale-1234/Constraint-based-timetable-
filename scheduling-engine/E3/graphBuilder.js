
/*
 E3 - Scheduling & Conflict Resolution
 Module: Graph Builder

 Vertices = Teaching sessions
 Edges = Potential scheduling conflicts

 Rules:
 1. A1 and A2 are separate only for laboratory sessions.
 2. Theory sessions use the complete division.
 3. A1 and A2 labs can run simultaneously if resources differ.
 4. A full-division theory session conflicts with either lab batch.
 5. Shared faculty or room always creates a potential conflict.
*/

// Get faculty IDs from both supported formats.
function getFacultyIds(session) {
    const ids = session.facultyIds ||
        (session.facultyId != null
            ? [session.facultyId]
            : []);

    return ids.filter(id => id != null).map(id => String(id).trim());
}

// Get batch IDs from both supported formats.
function getBatchIds(session) {
    const batches = session.batchIds ??
        (session.batch ? [session.batch] : []);

    return batches.map(String).filter(batch => {
        return !String(batch)
            .toLowerCase()
            .includes("(full)");
    });
}

// Identify a full-division session.
function isFullDivision(session) {
    const batch = session.batch;

    // Actual workbook format: A(full), B(full), etc.
    if (
        typeof batch === "string" &&
        batch.trim().toLowerCase().endsWith("(full)")
    ) {
        return true;
    }

    // Legacy format: no batch information means
    // the complete division.
    return (
        batch == null &&
        (!session.batchIds || session.batchIds.length === 0)
    );
}

// Find potential resource conflicts between two sessions.
function getResourceConflicts(s1, s2) {
    const conflicts = [];

    if (s1.distinctDayGroup && s1.distinctDayGroup === s2.distinctDayGroup) {
        conflicts.push("DAY_SEPARATION");
    }

    // 1. Faculty conflict.
    const faculty1 = getFacultyIds(s1);
    const faculty2 = getFacultyIds(s2);

    const sharedFaculty = faculty1.some(
        facultyId => faculty2.includes(facultyId)
    );

    if (sharedFaculty) {
        conflicts.push("FACULTY");
    }

    // 2. Room conflict.
    if (
        s1.roomId != null &&
        s2.roomId != null &&
        String(s1.roomId) === String(s2.roomId)
    ) {
        conflicts.push("ROOM");
    }

    // 3. Division and batch conflicts.
    const sameDivision =
        s1.divisionId != null &&
        s2.divisionId != null &&
        String(s1.divisionId) === String(s2.divisionId);

    if (sameDivision) {
        const batches1 = getBatchIds(s1);
        const batches2 = getBatchIds(s2);

        // Same batch cannot attend two sessions.
        const sharedBatch = batches1.some(
            batch => batches2.includes(batch)
        );

        if (sharedBatch) {
            conflicts.push("BATCH");
        }

        // Theory/full-division session conflicts with
        // either laboratory batch.
        else if (
            isFullDivision(s1) ||
            isFullDivision(s2)
        ) {
            conflicts.push("DIVISION");
        }
    }

    return conflicts;
}

// Build an undirected conflict graph.
function buildConflictGraph(sessions) {
    const graph = new Map();

    // Step 1: Create one vertex for every session.
    sessions.forEach(session => {
        graph.set(session.id, []);
    });

    // Step 2: Compare every pair of sessions.
    for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
            const s1 = sessions[i];
            const s2 = sessions[j];

            const conflicts = getResourceConflicts(s1, s2);

            // Step 3: Add an edge when resources may conflict.
            if (conflicts.length > 0) {
                graph.get(s1.id).push({
                    sessionId: s2.id,
                    reasons: [...conflicts]
                });

                graph.get(s2.id).push({
                    sessionId: s1.id,
                    reasons: [...conflicts]
                });
            }
        }
    }

    return graph;
}

module.exports = {
    buildConflictGraph,
    getResourceConflicts,
    getFacultyIds,
    getBatchIds,
    isFullDivision
};
