
const { buildConflictGraph } = require("./graphBuilder");
const { backtracking } = require("./backtracking");
const { greedySchedule } = require("./greedyScheduler");
const { validateTimetable } = require("./timetableValidator");
const { generateConflictReport } = require("./conflictReporter");

const {
    generateTimetableFromData
} = require("./resourceScheduler");

const {
    getCollegeSlots,
    getConsecutiveSlotGroups
} = require("./collegeTimeConfig");

const { filterAllowedSlots } = require("./timeRestrictions");
const { filterWorkingHours } = require("./workingHours");
const { prepareSourceSessions } = require("./sourceSessionPreparer");

// --------------------------------------------------
// 1. SLOT UTILITIES
// --------------------------------------------------

function slotKey(slot) {
    if (Array.isArray(slot)) {
        return slot.map(slotKey).join("|");
    }

    if (typeof slot === "object" && slot !== null) {
        return `${slot.day}-${slot.slotId}`;
    }

    return String(slot);
}

// Check whether two assignments overlap.
function assignmentsOverlap(a, b) {
    const first = Array.isArray(a) ? a : [a];
    const second = Array.isArray(b) ? b : [b];

    const keys = new Set(first.map(slotKey));

    return second.some(slot => keys.has(slotKey(slot)));
}

// --------------------------------------------------
// 2. RESOURCE CONFLICTS
// --------------------------------------------------

function getResourceConflicts(a, b) {
    const reasons = [];

    const facultyA = a.facultyIds ||
        (a.facultyId != null ? [a.facultyId] : []);

    const facultyB = b.facultyIds ||
        (b.facultyId != null ? [b.facultyId] : []);

    if (facultyA.some(id => facultyB.includes(id))) {
        reasons.push("FACULTY");
    }

    if (
        a.roomId != null &&
        b.roomId != null &&
        a.roomId === b.roomId
    ) {
        reasons.push("ROOM");
    }

    if (
        a.divisionId != null &&
        b.divisionId != null &&
        a.divisionId === b.divisionId
    ) {
        const batchesA = a.batchIds ||
            (a.batch ? [a.batch] : []);

        const batchesB = b.batchIds ||
            (b.batch ? [b.batch] : []);

        const fullA = !a.batch ||
            String(a.batch).toLowerCase().includes("(full)");

        const fullB = !b.batch ||
            String(b.batch).toLowerCase().includes("(full)");

        const sharedBatch = batchesA.some(batch =>
            batchesB.includes(batch)
        );

        if (sharedBatch) {
            reasons.push("BATCH");
        } else if (fullA || fullB) {
            reasons.push("DIVISION");
        }
    }

    return reasons;
}

// --------------------------------------------------
// 3. AVAILABILITY CHECKING
// --------------------------------------------------

function isAvailable(candidate, availability, resourceId) {
    if (availability === null) return true;

    if (resourceId == null) return true;

    const allowed = availability[resourceId] || [];

    const required = Array.isArray(candidate)
        ? candidate
        : [candidate];

    return required.every(slot => {
        const key = slotKey(slot);

        return allowed.some(item => slotKey(item) === key);
    });
}

// --------------------------------------------------
// 4. BUILD CANDIDATE DOMAINS
// --------------------------------------------------

function buildDomains(
    sessions,
    availableSlots,
    facultyAvailability,
    roomAvailability,
    blockedSlots,
    workingSlots
) {
    const domains = new Map();

    for (const session of sessions) {
        const isLab =
            session.isLab === true ||
            session.type === "LAB";

        const durationHours = session.durationHours ||
            (session.durationSlots ? session.durationSlots : 1);

        let candidates;

        if (
            isLab &&
            availableSlots.length > 0 &&
            typeof availableSlots[0] === "object"
        ) {
            candidates = getConsecutiveSlotGroups(
                availableSlots,
                durationHours
            );

            // Four-hour labs require explicitly configured
            // special uninterrupted slots.
            if (durationHours === 4) {
                const specialSlots = availableSlots.filter(
                    slot =>
                        slot.type === "SPECIAL_LAB" &&
                        slot.durationMinutes >= 240
                );

                candidates = specialSlots.map(slot => [slot]);
            }
        } else if (isLab) {
            // Legacy string-slot support for existing tests.
            const duration = session.durationSlots || 2;
            candidates = [];

            for (
                let i = 0;
                i <= availableSlots.length - duration;
                i++
            ) {
                candidates.push(
                    availableSlots.slice(i, i + duration)
                );
            }
        } else {
            candidates = [...availableSlots];
        }

        // Remove blocked slots.
        candidates = candidates.filter(candidate => {
            const group = Array.isArray(candidate)
                ? candidate
                : [candidate];

            return group.every(slot =>
                !blockedSlots.some(
                    blocked => slotKey(blocked) === slotKey(slot)
                )
            );
        });

        // Apply working-hour restrictions to legacy string slots.
        if (
            workingSlots !== null &&
            availableSlots.length > 0 &&
            typeof availableSlots[0] !== "object"
        ) {
            candidates = filterWorkingHours(
                candidates,
                workingSlots
            );
        }

        // Faculty availability.
        const facultyIds = session.facultyIds ||
            (session.facultyId != null
                ? [session.facultyId]
                : []);

        candidates = candidates.filter(candidate =>
            facultyIds.every(facultyId =>
                isAvailable(
                    candidate,
                    facultyAvailability,
                    facultyId
                )
            )
        );

        // Room availability.
        candidates = candidates.filter(candidate =>
            isAvailable(
                candidate,
                roomAvailability,
                session.roomId
            )
        );

        domains.set(session.id, candidates);
    }

    return domains;
}

// --------------------------------------------------
// 5. BACKTRACKING SOLVER
// --------------------------------------------------

function solveSchedule(sessions, domains, preassigned = new Map()) {
    const graph = buildConflictGraph(sessions);

    return backtracking(graph, domains, preassigned);
}

// --------------------------------------------------
// 6. SOURCE SESSION PREPARATION
// --------------------------------------------------

function mergePreparedSessions(callerSessions, preparedSessions) {
    const callerById = new Map(
        (Array.isArray(callerSessions) ? callerSessions : [])
            .map(session => [session.id, session])
    );

    return preparedSessions.map(prepared => {
        const supplied = callerById.get(prepared.id) || {};

        return {
            ...prepared,
            ...supplied,
            day: prepared.day,
            slotId: prepared.slotId,
            isFixed: prepared.isFixed,
            ...(prepared.originalAssignment
                ? { originalAssignment: prepared.originalAssignment }
                : {})
        };
    });
}

// Return the source Time_Slot record for an approved exception.
function getOriginalSlot(session, sourceData) {
    const timeSlots = Array.isArray(sourceData.timeSlots)
        ? sourceData.timeSlots
        : [];

    const matchingSlot = timeSlots.find(slot =>
        String(slot.day).toUpperCase() ===
            String(session.day).toUpperCase() &&
        Number(slot.slotId) === Number(session.slotId)
    );

    return matchingSlot || {
        day: session.day,
        slotId: session.slotId
    };
}

// --------------------------------------------------
// 7. LEGACY TIMETABLE GENERATION
// --------------------------------------------------

function generateTimetable(
    sessions,
    availableSlots = null,
    facultyAvailability = null,
    roomAvailability = null,
    blockedSlots = [],
    workingSlots = null,
    sourceData = null
) {
    let sourceValidation = null;
    let sourcePreparation = null;

    const preassigned = new Map();

    // Prepare source records when sourceData is supplied.
    if (sourceData !== null) {
        sourcePreparation = prepareSourceSessions(sourceData);
        sourceValidation = sourcePreparation.validation;

        // Use source-prepared sessions as the scheduling input.
        sessions = mergePreparedSessions(
            sessions,
            sourcePreparation.sessionsForScheduling
        );

        // Approved exceptions are pinned to their source assignments.
        for (
            const approvedSession of
            sourcePreparation.approvedExceptionSessions
        ) {
            const included = sessions.some(
                session => session.id === approvedSession.id
            );

            if (included) {
                preassigned.set(
                    approvedSession.id,
                    [getOriginalSlot(approvedSession, sourceData)]
                );
            }
        }
    }

    // Default to the college's configured timetable slots.
    if (availableSlots === null) {
        availableSlots = getCollegeSlots();
    }

    const graph = buildConflictGraph(sessions);

    const domains = buildDomains(
        sessions,
        availableSlots,
        facultyAvailability,
        roomAvailability,
        blockedSlots,
        workingSlots
    );

    // Approved exceptions are pinned to their source assignments.
    for (const [sessionId, assignment] of preassigned) {
        domains.set(sessionId, [assignment]);
    }

    // Use greedy scheduling only when there are no pinned assignments.
    const hasLab = sessions.some(
        session =>
            session.isLab === true ||
            session.type === "LAB"
    );

    const usesCollegeObjects =
        availableSlots.length > 0 &&
        typeof availableSlots[0] === "object";

    if (
        preassigned.size === 0 &&
        !hasLab &&
        !usesCollegeObjects &&
        facultyAvailability === null &&
        roomAvailability === null &&
        blockedSlots.length === 0 &&
        workingSlots === null
    ) {
        const greedyResult = greedySchedule(
            graph,
            sessions,
            availableSlots
        );

        if (greedyResult !== null) {
            const validation = validateTimetable(
                sessions,
                greedyResult,
                { availableSlots }
            );

            if (validation.valid) {
                return {
                    success: true,
                    method: "Greedy",
                    assignments: greedyResult,
                    errors: [],
                    sourceValidation,
                    sourcePreparation
                };
            }
        }
    }

    // Backtracking scheduling.
    const result = solveSchedule(
        sessions,
        domains,
        preassigned
    );

    if (result !== null) {
        const validation = validateTimetable(
            sessions,
            result,
            { availableSlots }
        );

        if (validation.valid) {
            return {
                success: true,
                method: "Backtracking",
                assignments: result,
                errors: [],
                sourceValidation,
                sourcePreparation
            };
        }

        return {
            success: false,
            method: "Backtracking",
            assignments: null,
            errors: validation.errors,
            sourceValidation,
            sourcePreparation
        };
    }

    // No valid timetable found.
    const conflictReport = generateConflictReport(
        sessions,
        graph,
        domains
    );

    return {
        success: false,
        method: "None",
        assignments: null,
        errors: ["No valid timetable found."],
        conflictReport,
        sourceValidation,
        sourcePreparation
    };
}

// --------------------------------------------------
// 8. EXPORTS
// --------------------------------------------------

module.exports = {
    generateTimetable,

    // New resource-aware generation entry point.
    generateTimetableFromData,

    // Existing utility exports.
    assignmentsOverlap,
    buildDomains,
    solveSchedule,
    getResourceConflicts,
    mergePreparedSessions,
    getOriginalSlot
};
