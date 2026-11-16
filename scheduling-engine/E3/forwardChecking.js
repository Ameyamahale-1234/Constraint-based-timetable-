
function slotKey(slot) {
    if (slot && typeof slot === 'object' && Array.isArray(slot.slots)) return slot.slots.map(slotKey).join('|');
    if (Array.isArray(slot)) {
        return slot.map(slotKey).join("|");
    }

    if (slot && typeof slot === "object") {
        return `${slot.day}-${slot.slotId}`;
    }

    return String(slot);
}

function intervalsOverlap(a, b) {
    return a && b && typeof a === 'object' && typeof b === 'object' &&
        a.day && a.day === b.day &&
        Number.isFinite(a.startMinutes) && Number.isFinite(a.endMinutes) &&
        Number.isFinite(b.startMinutes) && Number.isFinite(b.endMinutes) &&
        a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}
function hasOverlap(slotA, slotB) {
    if (slotA && !Array.isArray(slotA) && Array.isArray(slotA.slots)) slotA = slotA.slots;
    if (slotB && !Array.isArray(slotB) && Array.isArray(slotB.slots)) slotB = slotB.slots;
    const slotsA = Array.isArray(slotA) ? slotA : [slotA];
    const slotsB = Array.isArray(slotB) ? slotB : [slotB];
    return slotsA.some(a => slotsB.some(b => {
        if (intervalsOverlap(a, b)) return true;
        return slotKey(a) === slotKey(b);
    }));
}

function getDays(assignment) {
    if (assignment && !Array.isArray(assignment) && Array.isArray(assignment.slots)) assignment = assignment.slots;
    const values = Array.isArray(assignment) ? assignment : [assignment];
    return new Set(values.filter(x => x && typeof x === "object" && x.day).map(x => x.day));
}
function hasConstraintConflict(edge, a, b) {
    const reasons = edge.reasons || [];
    const resourceCandidates = !!(a && b && !Array.isArray(a) && !Array.isArray(b) &&
        Array.isArray(a.slots) && Array.isArray(b.slots));
    if (hasOverlap(a, b)) {
        // Legacy domains contain only slots: an edge means the sessions
        // cannot share any overlapping slot (preserves existing API behavior).
        if (!resourceCandidates) return true;
        if (reasons.includes('FACULTY') && a.facultyId != null && a.facultyId === b.facultyId) return true;
        if (reasons.includes('ROOM') && a.roomId != null && a.roomId === b.roomId) return true;
        if (reasons.some(r => ['DIVISION', 'BATCH'].includes(r))) return true;
    }
    if (reasons.includes("DAY_SEPARATION")) {
        const daysA = getDays(a), daysB = getDays(b);
        return [...daysA].some(day => daysB.has(day));
    }
    return false;
}

function forwardChecking(
    graph,
    domains,
    sessionId,
    assignedSlot,
    assignments = new Map()
) {
    const updatedDomains = new Map();

    for (const [id, slots] of domains) {
        updatedDomains.set(id, [...slots]);
    }

    updatedDomains.set(sessionId, [assignedSlot]);

    for (const edge of graph.get(sessionId) || []) {
        const neighbourId = edge.sessionId;

        // Do not prune already-assigned sessions.
        if (
            neighbourId === sessionId ||
            assignments.has(neighbourId)
        ) {
            continue;
        }

        const neighbourDomain = updatedDomains.get(neighbourId);

        if (!neighbourDomain) continue;

        const remainingSlots = neighbourDomain.filter(
            slot => !hasConstraintConflict(edge, slot, assignedSlot)
        );

        updatedDomains.set(neighbourId, remainingSlots);

        if (remainingSlots.length === 0) {
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

module.exports = {
    forwardChecking,
    hasOverlap,
    intervalsOverlap,
    hasConstraintConflict
};
