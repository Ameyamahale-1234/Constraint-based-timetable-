const { validateSourceData } = require("./sourceDataValidator");

function prepareSourceSessions(input) {
    if (!input || !Array.isArray(input.sessions) || !Array.isArray(input.timeSlots)) {
        throw new Error("Expected source data with sessions and timeSlots arrays.");
    }

    const validation = validateSourceData(input);

    const manualReviewIds = new Set(
        validation.manualReview.map(item => item.sessionId)
    );

    const reschedulingIds = new Set(
        validation.reschedulingRequired.map(item => item.sessionId)
    );

    const approvedExceptionIds = new Set(
        validation.approvedExceptions.map(item => item.sessionId)
    );

    const manualReviewSessions = input.sessions.filter(
        session => manualReviewIds.has(session.id)
    );

    const reschedulingSessions = input.sessions
        .filter(session => reschedulingIds.has(session.id))
        .map(session => ({
            ...session,
            originalAssignment: {
                day: session.day,
                slotId: session.slotId
            },
            day: null,
            slotId: null,
            isFixed: false
        }));

    const approvedExceptionSessions = input.sessions.filter(
        session => approvedExceptionIds.has(session.id)
    );

    // Keep all non-manual-review sessions. Invalid non-fixed sessions
    // are included with their original assignment cleared for rescheduling.
    const sessionsForScheduling = input.sessions
        .filter(session => !manualReviewIds.has(session.id))
        .map(session => {
            if (!reschedulingIds.has(session.id)) {
                return { ...session };
            }

            return reschedulingSessions.find(
                prepared => prepared.id === session.id
            );
        });

    return {
        validSourceData: validation.valid,
        validation,
        sessionsForScheduling,
        manualReviewSessions,
        reschedulingSessions,
        approvedExceptionSessions,
        summary: {
            totalSourceSessions: input.sessions.length,
            sessionsForScheduling: sessionsForScheduling.length,
            manualReview: manualReviewSessions.length,
            reschedulingRequired: reschedulingSessions.length,
            approvedExceptions: approvedExceptionSessions.length
        }
    };
}

module.exports = { prepareSourceSessions };
