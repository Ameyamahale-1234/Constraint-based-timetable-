
const { generateSessions } = require("./sessionGenerator");

const {
    getCollegeSlots,
    getConsecutiveSlotGroups
} = require("./collegeTimeConfig");

const {
    forwardChecking,
    hasConstraintConflict
} = require("./forwardChecking");

const { getResourceConflicts } = require("./graphBuilder");

const { validateTimetable } = require("./timetableValidator");

// Convert availability records into a resource-wise lookup.
function normalizeAvailability(rows, resourceKey) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    const result = {};

    for (const row of rows) {
        const id =
            row[resourceKey] ??
            row.resourceId ??
            row.id;

        if (id == null) continue;

        const slot = row.slot ?? row.timeSlot ?? row;

        if (!result[id]) result[id] = [];

        result[id].push(slot);
    }

    return result;
}

function slotKey(slot) {
    if (!slot || typeof slot !== "object") {
        return String(slot);
    }

    return `${slot.day}-${slot.slotId}`;
}

function availableFor(candidateSlots, availability, resourceId) {
    if (!availability) return true;

    const allowed = availability[resourceId];

    if (!allowed) return false;

    const allowedKeys = new Set(allowed.map(slotKey));

    return candidateSlots.every(slot =>
        allowedKeys.has(slotKey(slot))
    );
}

// Match theory courses with classrooms and labs with laboratories.
function roomMatches(room, requiredType) {
    const type = String(
        room.roomType ?? room.room_type ?? ""
    ).toUpperCase();

    if (requiredType === "LAB") {
        return type.includes("LAB");
    }

    return (
        type.includes("CLASS") ||
        type.includes("LECTURE") ||
        type === "ROOM"
    );
}

// Generate valid time combinations for a session.
function candidateSlots(session, availableSlots) {
    const duration = Number(session.durationHours || 1);

    if (duration === 1) {
        return availableSlots
            .filter(slot => slot.type !== "SPECIAL_LAB")
            .map(slot => [slot]);
    }

    if (duration === 4) {
        return availableSlots
            .filter(slot =>
                slot.type === "SPECIAL_LAB" &&
                slot.durationMinutes >= 240
            )
            .map(slot => [slot]);
    }

    const regularSlots = availableSlots.filter(
        slot => slot.type !== "SPECIAL_LAB"
    );

    return getConsecutiveSlotGroups(
        regularSlots,
        duration
    );
}

// Build edges between sessions that may compete for resources.

function buildResourceGraph(sessions, facultyOptions, roomOptions) {
    const graph = new Map(
        sessions.map(session => [session.id, []])
    );

    for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
            const a = sessions[i];
            const b = sessions[j];

            const reasons = [];


// Four-credit theory sessions must occur on different days.
if (
    a.distinctDayGroup &&
    b.distinctDayGroup &&
    a.distinctDayGroup === b.distinctDayGroup &&
    String(a.courseId) === String(b.courseId) &&
    String(a.divisionId) === String(b.divisionId)
) {
    reasons.push("DAY_SEPARATION");
}

            // Check division and batch conflicts.
            const structuralConflicts =
                getResourceConflicts(a, b);

            for (const reason of structuralConflicts) {
                if (
                    ["DIVISION", "BATCH"].includes(reason) &&
                    !reasons.includes(reason)
                ) {
                    reasons.push(reason);
                }
            }

            // Check whether sessions could use the same faculty.
            const facultyA = (facultyOptions.get(a.id) || [])
                .map(String);

            const facultyB = (facultyOptions.get(b.id) || [])
                .map(String);

            const sharedFaculty = facultyA.some(id =>
                facultyB.includes(id)
            );

            if (sharedFaculty) {
                reasons.push("FACULTY");
            }

            // Check whether sessions could use the same room.
            const roomsA = (roomOptions.get(a.id) || [])
                .map(String);

            const roomsB = (roomOptions.get(b.id) || [])
                .map(String);

            const sharedRoom = roomsA.some(id =>
                roomsB.includes(id)
            );

            if (sharedRoom) {
                reasons.push("ROOM");
            }

            // Add an edge only when a genuine shared
            // resource or structural constraint exists.
            if (reasons.length === 0) {
                continue;
            }

            graph.get(a.id).push({
                sessionId: b.id,
                reasons
            });

            graph.get(b.id).push({
                sessionId: a.id,
                reasons
            });
        }
    }

    return graph;
}


// MRV + Backtracking + Forward Checking.
function solveResourceCsp(graph, domains) {
    function solve(currentDomains, assignments) {
        if (assignments.size === domains.size) {
            return new Map(assignments);
        }

        // Minimum Remaining Values.
        const remaining = [...currentDomains.keys()]
            .filter(id => !assignments.has(id));

        remaining.sort((a, b) => {
            const sizeDifference =
                currentDomains.get(a).length -
                currentDomains.get(b).length;

            if (sizeDifference !== 0) {
                return sizeDifference;
            }

            return (
                (graph.get(b) || []).length -
                (graph.get(a) || []).length
            );
        });

        const sessionId = remaining[0];

        if (!sessionId) return null;

        const candidates =
            currentDomains.get(sessionId) || [];

        for (const candidate of candidates) {
            let conflict = false;

            for (const edge of graph.get(sessionId) || []) {
                const otherAssignment =
                    assignments.get(edge.sessionId);

                if (!otherAssignment) continue;

                if (
                    hasConstraintConflict(
                        edge,
                        candidate,
                        otherAssignment
                    )
                ) {
                    conflict = true;
                    break;
                }
            }

            if (conflict) continue;

            const nextAssignments = new Map(assignments);

            nextAssignments.set(sessionId, candidate);

            const result = forwardChecking(
                graph,
                currentDomains,
                sessionId,
                candidate,
                nextAssignments
            );

            if (!result.success) continue;

            const solved = solve(
                result.domains,
                nextAssignments
            );

            if (solved) return solved;
        }

        return null;
    }

    return solve(domains, new Map());
}

// Main resource-aware timetable generation function.
function generateTimetableFromData(data, options = {}) {
    const sessions = generateSessions(data, options);

    const availableSlots =
        options.availableSlots ||
        getCollegeSlots(options.timeConfig);

    const facultyAvailability =
        options.facultyAvailability ||
        normalizeAvailability(
            data.facultyAvailability,
            "facultyId"
        );

    const roomAvailability =
        options.roomAvailability ||
        normalizeAvailability(
            data.roomAvailability,
            "roomId"
        );

    const facultyById = new Map(
        (data.faculty || []).map(faculty => [
            String(faculty.facultyId ?? faculty.faculty_id),
            faculty
        ])
    );

    const rooms = data.rooms || [];

    const facultyOptions = new Map();
    const roomOptions = new Map();
    const domains = new Map();
    const errors = [];

    for (const session of sessions) {
        const eligibleFaculty = (
            session.eligibleFacultyIds || []
        ).filter(id =>
            id != null && facultyById.has(String(id))
        );

        const matchingRooms = rooms.filter(room =>
            roomMatches(room, session.isLab ? "LAB" : "CLASSROOM")
        );

        facultyOptions.set(
            session.id,
            eligibleFaculty
        );

        roomOptions.set(
            session.id,
            matchingRooms.map(room =>
                room.roomId ?? room.room_id
            )
        );

        if (eligibleFaculty.length === 0) {
            errors.push(
                `${session.id}: No eligible faculty available`
            );
        }

        if (matchingRooms.length === 0) {
            errors.push(
                `${session.id}: No suitable room available`
            );
        }

        const timeCandidates = candidateSlots(
            session,
            availableSlots
        );

        const candidates = [];

        for (const facultyId of eligibleFaculty) {
            for (const room of matchingRooms) {
                const roomId = room.roomId ?? room.room_id;

                for (const slots of timeCandidates) {
                    if (
                        !availableFor(
                            slots,
                            facultyAvailability,
                            facultyId
                        )
                    ) {
                        continue;
                    }

                    if (
                        !availableFor(
                            slots,
                            roomAvailability,
                            roomId
                        )
                    ) {
                        continue;
                    }

                    candidates.push({
                        slots,
                        facultyId,
                        roomId
                    });
                }
            }
        }

        domains.set(session.id, candidates);

        if (candidates.length === 0) {
            errors.push(
                `${session.id}: No valid faculty-room-time combination`
            );
        }
    }

    if (errors.length > 0) {
        return {
            success: false,
            method: "ResourceBacktracking",
            sessions,
            assignments: null,
            errors,
            domains
        };
    }

    const graph = buildResourceGraph(
        sessions,
        facultyOptions,
        roomOptions
    );

    const assignments = solveResourceCsp(
        graph,
        domains
    );

    if (!assignments) {
        return {
            success: false,
            method: "ResourceBacktracking",
            sessions,
            assignments: null,
            errors: [
                "No conflict-free combination of faculty, room and time slots exists."
            ],
            domains
        };
    }

    const validation = validateTimetable(
        sessions,
        assignments,
        { availableSlots }
    );

    const resourceErrors = [];

    for (const session of sessions) {
        const assignment = assignments.get(session.id);

        if (
            !assignment ||
            assignment.facultyId == null ||
            assignment.roomId == null
        ) {
            resourceErrors.push(
                `${session.id}: Faculty or room assignment missing`
            );
        }
    }

    const allErrors = [
        ...validation.errors,
        ...resourceErrors
    ];

    return {
        success: allErrors.length === 0,
        method: "ResourceBacktracking",
        sessions,
        assignments: allErrors.length === 0
            ? assignments
            : null,
        errors: allErrors,
        domains
    };
}

module.exports = {
    generateTimetableFromData,
    buildResourceGraph,
    solveResourceCsp
};
