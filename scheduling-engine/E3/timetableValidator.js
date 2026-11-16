
/*
 * E3 - Scheduling & Conflict Resolution
 * Module: Timetable Validator
 *
 * Validates:
 * 1. Missing assignments
 * 2. Valid college time slots
 * 3. Correct session duration
 * 4. Continuous laboratory sessions
 * 5. Faculty conflicts
 * 6. Room conflicts
 * 7. Full-division conflicts
 * 8. Laboratory batch conflicts
 * 9. Different-day constraints
 *
 * Supports:
 * Legacy assignments:
 * ["9-10 AM", "10-11 AM"]
 *
 * Resource assignments:
 * {
 *   slots: [slot1, slot2],
 *   facultyId: "F101",
 *   roomId: "LAB1"
 * }
 */

const {
    getAssignmentSlots,
    hasOverlap
} = require("./forwardChecking");

const {
    getResourceConflicts
} = require("./graphBuilder");


// --------------------------------------------------
// 1. NORMALIZE ASSIGNMENT
// --------------------------------------------------

function getSlots(assignment) {
    return getAssignmentSlots(assignment);
}


// --------------------------------------------------
// 2. SLOT KEY
// --------------------------------------------------

function slotKey(slot) {
    if (!slot || typeof slot !== "object") {
        return String(slot);
    }

    return `${String(slot.day).toUpperCase()}-${slot.slotId}`;
}


// --------------------------------------------------
// 3. VALIDATE ASSIGNMENT DURATION
// --------------------------------------------------

function validateDuration(session, slots, errors) {
    if (session.durationHours == null) {
        return;
    }

    // Legacy string slots have no duration metadata.
    const hasDurationMetadata = slots.every(slot =>
        slot &&
        typeof slot === "object" &&
        Number.isFinite(Number(slot.durationMinutes))
    );

    if (!hasDurationMetadata) {
        return;
    }

    const actualMinutes = slots.reduce(
        (sum, slot) => sum + Number(slot.durationMinutes),
        0
    );

    const expectedMinutes =
        Number(session.durationHours) * 60;

    if (actualMinutes !== expectedMinutes) {
        errors.push(
            `${session.id}: Assigned duration is ${actualMinutes} minutes; expected ${expectedMinutes} minutes`
        );
    }
}


// --------------------------------------------------
// 4. VALIDATE CONTINUOUS SLOT GROUP
// --------------------------------------------------

function validateContinuity(session, slots, errors) {
    if (slots.length <= 1) {
        return;
    }

    // Legacy string slots do not contain timing metadata.
    // Their continuity is established during candidate generation.
    const hasTimingMetadata = slots.every(slot =>
        slot &&
        typeof slot === "object" &&
        Number.isFinite(Number(slot.startMinutes)) &&
        Number.isFinite(Number(slot.endMinutes)) &&
        slot.day != null
    );

    if (!hasTimingMetadata) {
        return;
    }

    const sorted = [...slots].sort(
        (a, b) =>
            Number(a.startMinutes) - Number(b.startMinutes)
    );

    const day = String(sorted[0].day).toUpperCase();

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];

        if (String(current.day).toUpperCase() !== day) {
            errors.push(
                `${session.id}: Multi-period assignment spans multiple days`
            );
            return;
        }

        if (
            i > 0 &&
            Number(sorted[i - 1].endMinutes) !==
            Number(current.startMinutes)
        ) {
            errors.push(
                `${session.id}: Multi-period assignment is not uninterrupted or crosses a break`
            );
            return;
        }
    }
}


// --------------------------------------------------
// 5. VALIDATE AVAILABLE COLLEGE SLOTS
// --------------------------------------------------

function validateAvailableSlots(
    session,
    slots,
    validKeys,
    errors
) {
    if (!validKeys) {
        return;
    }

    for (const slot of slots) {
        if (!validKeys.has(slotKey(slot))) {
            errors.push(
                `${session.id}: Assignment contains a slot outside the configured college timetable (${slotKey(slot)})`
            );
        }
    }
}


// --------------------------------------------------
// 6. VALIDATE RESOURCE ASSIGNMENTS
// --------------------------------------------------

function validateResources(session, assignment, errors) {
    // Legacy assignments are arrays or strings.
    if (
        !assignment ||
        typeof assignment !== "object" ||
        Array.isArray(assignment)
    ) {
        return;
    }

    if (assignment.facultyId == null) {
        errors.push(
            `${session.id}: Faculty assignment missing`
        );
    }

    if (assignment.roomId == null) {
        errors.push(
            `${session.id}: Room assignment missing`
        );
    }

    // Check faculty eligibility.
    if (
        assignment.facultyId != null &&
        Array.isArray(session.eligibleFacultyIds) &&
        session.eligibleFacultyIds.length > 0 &&
        !session.eligibleFacultyIds.some(
            id => String(id) === String(assignment.facultyId)
        )
    ) {
        errors.push(
            `${session.id}: Assigned faculty is not eligible for this course`
        );
    }
}


// --------------------------------------------------
// 7. VALIDATE DIFFERENT-DAY REQUIREMENT
// --------------------------------------------------

function validateDifferentDays(
    sessionA,
    sessionB,
    assignmentA,
    assignmentB,
    errors
) {
    if (
        !sessionA.distinctDayGroup ||
        sessionA.distinctDayGroup !== sessionB.distinctDayGroup
    ) {
        return;
    }

    if (
        String(sessionA.courseId) !== String(sessionB.courseId) ||
        String(sessionA.divisionId) !== String(sessionB.divisionId)
    ) {
        return;
    }

    const daysA = new Set(
        getSlots(assignmentA)
            .filter(slot =>
                slot &&
                typeof slot === "object" &&
                slot.day != null
            )
            .map(slot => String(slot.day).toUpperCase())
    );

    const daysB = new Set(
        getSlots(assignmentB)
            .filter(slot =>
                slot &&
                typeof slot === "object" &&
                slot.day != null
            )
            .map(slot => String(slot.day).toUpperCase())
    );

    if ([...daysA].some(day => daysB.has(day))) {
        errors.push(
            `${sessionA.id} and ${sessionB.id}: Sessions required on different days are assigned on the same day`
        );
    }
}


// --------------------------------------------------
// 8. VALIDATE RESOURCE CONFLICTS
// --------------------------------------------------

function validatePair(
    sessionA,
    sessionB,
    assignmentA,
    assignmentB,
    errors
) {
    if (
        assignmentA == null ||
        assignmentB == null
    ) {
        return;
    }

    validateDifferentDays(
        sessionA,
        sessionB,
        assignmentA,
        assignmentB,
        errors
    );

    // Resource conflicts matter only when time overlaps.
    if (!hasOverlap(assignmentA, assignmentB)) {
        return;
    }

    // Use actual selected faculty and room.
    // Fall back to session resources for legacy assignments.
    const actualSessionA = {
        ...sessionA,
        facultyId:
            assignmentA.facultyId ?? sessionA.facultyId,
        roomId:
            assignmentA.roomId ?? sessionA.roomId
    };

    const actualSessionB = {
        ...sessionB,
        facultyId:
            assignmentB.facultyId ?? sessionB.facultyId,
        roomId:
            assignmentB.roomId ?? sessionB.roomId
    };

    const conflicts = getResourceConflicts(
        actualSessionA,
        actualSessionB
    );

    const labels = {
        FACULTY: "Faculty conflict",
        ROOM: "Room conflict",
        DIVISION: "Full-division conflict",
        BATCH: "Laboratory batch conflict"
    };

    for (const conflict of conflicts) {
        errors.push(
            `${sessionA.id} and ${sessionB.id}: ${labels[conflict] || conflict}`
        );
    }
}


// --------------------------------------------------
// 9. MAIN TIMETABLE VALIDATOR
// --------------------------------------------------

function validateTimetable(
    sessions,
    assignments,
    options = {}
) {
    const errors = [];

    const availableSlots =
        options.availableSlots || null;

    const validKeys = availableSlots
        ? new Set(availableSlots.map(slotKey))
        : null;

    // Validate each individual session.
    for (const session of sessions) {
        const assignment = assignments?.get(session.id);

        if (assignment == null) {
            errors.push(
                `Missing assignment for ${session.id}`
            );
            continue;
        }

        const slots = getSlots(assignment);

        if (slots.length === 0) {
            errors.push(
                `${session.id}: No time slots assigned`
            );
            continue;
        }

        validateAvailableSlots(
            session,
            slots,
            validKeys,
            errors
        );

        validateDuration(
            session,
            slots,
            errors
        );

        validateContinuity(
            session,
            slots,
            errors
        );

        validateResources(
            session,
            assignment,
            errors
        );
    }

    // Compare every pair of assigned sessions.
    for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
            const sessionA = sessions[i];
            const sessionB = sessions[j];

            const assignmentA =
                assignments?.get(sessionA.id);

            const assignmentB =
                assignments?.get(sessionB.id);

            if (
                assignmentA == null ||
                assignmentB == null
            ) {
                continue;
            }

            validatePair(
                sessionA,
                sessionB,
                assignmentA,
                assignmentB,
                errors
            );
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}


// --------------------------------------------------
// 10. EXPORTS
// --------------------------------------------------

module.exports = {
    validateTimetable,
    getSlots,
    slotKey
};
