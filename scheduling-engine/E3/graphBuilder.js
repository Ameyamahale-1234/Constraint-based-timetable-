
/*
 * E3 - Scheduling & Conflict Resolution
 * Module: Graph Builder
 *
 * Vertices = Teaching sessions
 * Edges = Potential scheduling conflicts
 *
 * Rules:
 * 1. A1 and A2 are separate for laboratory sessions.
 * 2. Theory sessions use the complete division.
 * 3. A1 and A2 labs can run simultaneously if resources differ.
 * 4. Full-division theory conflicts with either lab batch.
 * 5. Shared faculty or room creates a potential conflict.
 * 6. Four-credit theory sessions must be on different days.
 */

// --------------------------------------------------
// 1. COMMON UTILITIES
// --------------------------------------------------

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return String(value).trim();
}

function toArray(value) {
    if (value === undefined || value === null || value === "") {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}


// --------------------------------------------------
// 2. GET FACULTY IDS
// --------------------------------------------------

function getFacultyIds(session) {
    const ids = [
        ...toArray(session.facultyIds),
        ...toArray(session.facultyId)
    ];

    return [
        ...new Set(
            ids
                .map(normalizeId)
                .filter(Boolean)
        )
    ];
}


// --------------------------------------------------
// 3. GET BATCH IDS
// --------------------------------------------------

function getBatchIds(session) {
    const batches = [
        ...toArray(session.batchIds),
        ...toArray(session.batch)
    ];

    return [
        ...new Set(
            batches
                .map(normalizeId)
                .filter(Boolean)
                .filter(batch =>
                    !batch.toLowerCase().includes("(full)")
                )
        )
    ];
}


// --------------------------------------------------
// 4. IDENTIFY FULL-DIVISION SESSIONS
// --------------------------------------------------

function isFullDivision(session) {
    const batchValues = [
        ...toArray(session.batch),
        ...toArray(session.batchIds)
    ];

    // Explicit full-division designation.
    if (
        batchValues.some(value =>
            String(value).trim().toLowerCase().endsWith("(full)")
        )
    ) {
        return true;
    }

    // No batch information means complete division.
    return batchValues.length === 0;
}


// --------------------------------------------------
// 5. CHECK SAME DIVISION
// --------------------------------------------------

function isSameDivision(s1, s2) {
    const division1 = normalizeId(s1.divisionId);
    const division2 = normalizeId(s2.divisionId);

    return (
        division1 !== null &&
        division2 !== null &&
        division1 === division2
    );
}


// --------------------------------------------------
// 6. CHECK SHARED FACULTY
// --------------------------------------------------

function hasSharedFaculty(s1, s2) {
    const faculty1 = new Set(getFacultyIds(s1));

    return getFacultyIds(s2).some(id =>
        faculty1.has(id)
    );
}


// --------------------------------------------------
// 7. CHECK SHARED ROOM
// --------------------------------------------------

function hasSharedRoom(s1, s2) {
    const room1 = normalizeId(s1.roomId);
    const room2 = normalizeId(s2.roomId);

    return (
        room1 !== null &&
        room2 !== null &&
        room1 === room2
    );
}


// --------------------------------------------------
// 8. CHECK SHARED BATCH
// --------------------------------------------------

function hasSharedBatch(s1, s2) {
    const batches1 = new Set(getBatchIds(s1));

    return getBatchIds(s2).some(batch =>
        batches1.has(batch)
    );
}


// --------------------------------------------------
// 9. CHECK DAY SEPARATION
// --------------------------------------------------

function requiresDaySeparation(s1, s2) {
    if (
        !s1.distinctDayGroup ||
        !s2.distinctDayGroup
    ) {
        return false;
    }

    const sameGroup =
        String(s1.distinctDayGroup) ===
        String(s2.distinctDayGroup);

    const sameCourse =
        normalizeId(s1.courseId) ===
        normalizeId(s2.courseId);

    return (
        sameGroup &&
        sameCourse &&
        isSameDivision(s1, s2)
    );
}


// --------------------------------------------------
// 10. GET RESOURCE CONFLICTS
// --------------------------------------------------

function getResourceConflicts(s1, s2) {
    const conflicts = [];

    // Four-credit theory sessions on different days.
    if (requiresDaySeparation(s1, s2)) {
        conflicts.push("DAY_SEPARATION");
    }

    // Shared faculty.
    if (hasSharedFaculty(s1, s2)) {
        conflicts.push("FACULTY");
    }

    // Shared room.
    if (hasSharedRoom(s1, s2)) {
        conflicts.push("ROOM");
    }

    // Division and batch constraints.
    if (isSameDivision(s1, s2)) {
        const sharedBatch = hasSharedBatch(s1, s2);

        if (sharedBatch) {
            conflicts.push("BATCH");
        } else if (
            isFullDivision(s1) ||
            isFullDivision(s2)
        ) {
            conflicts.push("DIVISION");
        }
    }

    return [...new Set(conflicts)];
}


// --------------------------------------------------
// 11. BUILD UNDIRECTED CONFLICT GRAPH
// --------------------------------------------------

function buildConflictGraph(sessions) {
    const graph = new Map();

    // Create one vertex for each session.
    for (const session of sessions) {
        if (!session.id) {
            throw new Error(
                "Every session must have a unique ID"
            );
        }

        if (graph.has(session.id)) {
            throw new Error(
                `Duplicate session ID: ${session.id}`
            );
        }

        graph.set(session.id, []);
    }

    // Compare every pair of sessions.
    for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
            const s1 = sessions[i];
            const s2 = sessions[j];

            const conflicts =
                getResourceConflicts(s1, s2);

            if (conflicts.length === 0) {
                continue;
            }

            // Add edge in both directions.
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

    return graph;
}


// --------------------------------------------------
// 12. EXPORTS
// --------------------------------------------------

module.exports = {
    buildConflictGraph,
    getResourceConflicts,
    getFacultyIds,
    getBatchIds,
    isFullDivision,
    isSameDivision,
    hasSharedFaculty,
    hasSharedRoom,
    hasSharedBatch,
    requiresDaySeparation,
    normalizeId
};
