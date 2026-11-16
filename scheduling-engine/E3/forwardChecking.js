
/*
 * E3 - Scheduling & Conflict Resolution
 * Module: Forward Checking
 *
 * Supports:
 * 1. Single-slot assignments
 * 2. Multiple consecutive slots
 * 3. Resource-aware assignments
 * 4. Faculty conflicts
 * 5. Room conflicts
 * 6. Division and batch conflicts
 * 7. Different-day constraints
 * 8. Actual time-interval overlap detection
 * 9. Forward checking with domain pruning
 */

// --------------------------------------------------
// 1. EXTRACT SLOTS FROM AN ASSIGNMENT
// --------------------------------------------------

function getAssignmentSlots(assignment) {
    if (
        assignment &&
        !Array.isArray(assignment) &&
        typeof assignment === "object" &&
        Array.isArray(assignment.slots)
    ) {
        return assignment.slots;
    }

    return Array.isArray(assignment)
        ? assignment
        : assignment == null
            ? []
            : [assignment];
}


// --------------------------------------------------
// 2. SLOT KEY
// --------------------------------------------------

function slotKey(slot) {
    if (Array.isArray(slot)) {
        return slot.map(slotKey).join("|");
    }

    if (slot && typeof slot === "object") {
        return `${slot.day}-${slot.slotId}`;
    }

    return String(slot);
}


// --------------------------------------------------
// 3. CONVERT TIME TO MINUTES
// --------------------------------------------------

function timeToMinutes(value) {
    if (typeof value === "number") {
        return value;
    }

    if (value == null) {
        return null;
    }

    const parts = String(value).split(":");

    if (parts.length !== 2) {
        return null;
    }

    const hour = Number(parts[0]);
    const minute = Number(parts[1]);

    if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute)
    ) {
        return null;
    }

    return hour * 60 + minute;
}


// --------------------------------------------------
// 4. CHECK TWO INDIVIDUAL SLOT INTERVALS
// --------------------------------------------------

function slotsOverlap(slotA, slotB) {
    if (!slotA || !slotB) {
        return false;
    }

    if (
        typeof slotA !== "object" ||
        typeof slotB !== "object"
    ) {
        return slotKey(slotA) === slotKey(slotB);
    }

    if (
        String(slotA.day).toUpperCase() !==
        String(slotB.day).toUpperCase()
    ) {
        return false;
    }

    const startA = timeToMinutes(
        slotA.startMinutes ?? slotA.start
    );

    const endA = timeToMinutes(
        slotA.endMinutes ?? slotA.end
    );

    const startB = timeToMinutes(
        slotB.startMinutes ?? slotB.start
    );

    const endB = timeToMinutes(
        slotB.endMinutes ?? slotB.end
    );

    // Use actual intervals when available.
    if (
        startA !== null &&
        endA !== null &&
        startB !== null &&
        endB !== null
    ) {
        return startA < endB && startB < endA;
    }

    // Backward compatibility for ID-only slots.
    return slotKey(slotA) === slotKey(slotB);
}


// --------------------------------------------------
// 5. CHECK ASSIGNMENT OVERLAP
// --------------------------------------------------

function hasOverlap(assignmentA, assignmentB) {
    const slotsA = getAssignmentSlots(assignmentA);
    const slotsB = getAssignmentSlots(assignmentB);

    return slotsA.some(slotA =>
        slotsB.some(slotB =>
            slotsOverlap(slotA, slotB)
        )
    );
}


// --------------------------------------------------
// 6. GET DAYS OCCUPIED BY AN ASSIGNMENT
// --------------------------------------------------

function getDays(assignment) {
    const slots = getAssignmentSlots(assignment);

    return new Set(
        slots
            .filter(slot =>
                slot &&
                typeof slot === "object" &&
                slot.day
            )
            .map(slot =>
                String(slot.day).toUpperCase()
            )
    );
}


// --------------------------------------------------
// 7. CHECK SHARED FACULTY OR ROOM
// --------------------------------------------------

function sharesResource(assignmentA, assignmentB) {
    if (!assignmentA || !assignmentB) {
        return false;
    }

    const facultyConflict =
        assignmentA.facultyId != null &&
        assignmentB.facultyId != null &&
        String(assignmentA.facultyId) ===
        String(assignmentB.facultyId);

    const roomConflict =
        assignmentA.roomId != null &&
        assignmentB.roomId != null &&
        String(assignmentA.roomId) ===
        String(assignmentB.roomId);

    return facultyConflict || roomConflict;
}


// --------------------------------------------------
// 8. CHECK CONSTRAINT CONFLICT
// --------------------------------------------------

function hasConstraintConflict(
    edge,
    assignmentA,
    assignmentB
) {
    if (!assignmentA || !assignmentB) {
        return false;
    }

    const reasons = edge?.reasons || [];

    // Different-day constraint.
    if (reasons.includes("DAY_SEPARATION")) {
        const daysA = getDays(assignmentA);
        const daysB = getDays(assignmentB);

        if (
            [...daysA].some(day => daysB.has(day))
        ) {
            return true;
        }
    }

    // Resource and student-group conflicts matter
    // only when the assignments overlap in time.
    if (!hasOverlap(assignmentA, assignmentB)) {
        return false;
    }

    // Same division or batch cannot attend
    // two sessions at the same time.
    if (
        reasons.includes("DIVISION") ||
        reasons.includes("BATCH")
    ) {
        return true;
    }

    // Actual selected resources.
    if (sharesResource(assignmentA, assignmentB)) {
        return true;
    }

    // Legacy compatibility.
    if (
        reasons.includes("FACULTY") &&
        (
            assignmentA.facultyId == null ||
            assignmentB.facultyId == null
        )
    ) {
        return true;
    }

    if (
        reasons.includes("ROOM") &&
        (
            assignmentA.roomId == null ||
            assignmentB.roomId == null
        )
    ) {
        return true;
    }

    return false;
}


// --------------------------------------------------
// 9. FORWARD CHECKING
// --------------------------------------------------

function forwardChecking(
    graph,
    domains,
    sessionId,
    assignedSlot,
    assignments = new Map()
) {
    // Copy domains to avoid modifying parent recursion state.
    const updatedDomains = new Map();

    for (const [id, candidates] of domains) {
        updatedDomains.set(id, [...candidates]);
    }

    // Lock the selected candidate.
    updatedDomains.set(sessionId, [assignedSlot]);

    // Process neighbouring sessions.
    for (const edge of graph.get(sessionId) || []) {
        const neighbourId = edge.sessionId;

        // Already assigned sessions are checked
        // by the backtracking solver.
        if (assignments.has(neighbourId)) {
            continue;
        }

        const neighbourDomain =
            updatedDomains.get(neighbourId);

        if (!neighbourDomain) {
            continue;
        }

        // Remove candidates conflicting with
        // the newly selected assignment.
        const remainingCandidates =
            neighbourDomain.filter(candidate =>
                !hasConstraintConflict(
                    edge,
                    candidate,
                    assignedSlot
                )
            );

        updatedDomains.set(
            neighbourId,
            remainingCandidates
        );

        // Empty domain means this branch cannot
        // produce a valid timetable.
        if (remainingCandidates.length === 0) {
            return {
                success: false,
                domains: updatedDomains,
                failedSession: neighbourId
            };
        }
    }

    return {
        success: true,
        domains: updatedDomains,
        failedSession: null
    };
}


// --------------------------------------------------
// 10. EXPORTS
// --------------------------------------------------

module.exports = {
    getAssignmentSlots,
    slotKey,
    timeToMinutes,
    slotsOverlap,
    hasOverlap,
    getDays,
    sharesResource,
    hasConstraintConflict,
    forwardChecking
};
