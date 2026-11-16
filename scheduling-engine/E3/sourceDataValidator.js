
const data = require("./fixtures/cse_timetable_test_fixture.json");

function isFixedSession(session) {
    return session.isFixed === true ||
        String(session.isFixed).toLowerCase() === "yes";
}

function validateSourceData(input = data) {
    const slotMap = new Map(
        input.timeSlots.map(slot => [
            `${slot.day}-${slot.slotId}`,
            slot
        ])
    );

    const approvedSaturdayLabs = new Set(input.approvedExceptions || []);
    const issues = [];
    const manualReview = [];
    const reschedulingRequired = [];
    const approvedExceptions = [];

    for (const session of input.sessions) {
        const slot = slotMap.get(
            `${session.day}-${session.slotId}`
        );

        let issue = null;

        if (!slot) {
            issue = {
                sessionId: session.id,
                type: "MISSING_SLOT",
                message: "Assigned time slot does not exist."
            };
        } else {
            const slotType = String(slot.slotType || "")
                .trim()
                .toLowerCase();

            // Explicitly approved Saturday labs
            if (
                session.day === "SAT" &&
                approvedSaturdayLabs.has(session.id)
            ) {
                approvedExceptions.push({
                    sessionId: session.id,
                    type: "APPROVED_SATURDAY_LAB"
                });
                continue;
            }

            if (slotType.includes("lunch")) {
                issue = {
                    sessionId: session.id,
                    type: "LUNCH_ASSIGNMENT",
                    message: "Session is assigned during lunch."
                };
            } else if (
                slotType.includes("day off") ||
                slotType.includes("dayoff")
            ) {
                issue = {
                    sessionId: session.id,
                    type: "DAY_OFF_ASSIGNMENT",
                    message: "Session is assigned on a day-off slot."
                };
            } else if (!slotType.includes("class")) {
                issue = {
                    sessionId: session.id,
                    type: "INVALID_SLOT_TYPE",
                    message: "Slot is not a valid class slot."
                };
            }
        }

        if (issue) {
            issue.day = session.day;
            issue.slotId = session.slotId;
            issue.isFixed = isFixedSession(session);

            issues.push(issue);

            if (issue.isFixed) {
                manualReview.push({
                    ...issue,
                    action: "COORDINATOR_APPROVAL_REQUIRED"
                });
            } else {
                reschedulingRequired.push({
                    ...issue,
                    action: "RESCHEDULE_SESSION"
                });
            }
        }
    }

    return {
        valid: issues.length === 0,
        totalSessions: input.sessions.length,
        totalIssues: issues.length,
        totalManualReview: manualReview.length,
        totalReschedulingRequired: reschedulingRequired.length,
        totalApprovedExceptions: approvedExceptions.length,
        issues,
        manualReview,
        reschedulingRequired,
        approvedExceptions
    };
}

if (require.main === module) {
    const result = validateSourceData();

    console.log("\n===== SOURCE DATA VALIDATION =====");
    console.log("Total sessions:", result.totalSessions);
    console.log("Total issues:", result.totalIssues);

    console.log("\n===== MANUAL REVIEW =====");
    console.log(result.manualReview);

    console.log("\n===== RESCHEDULING REQUIRED =====");
    console.log(result.reschedulingRequired);

    console.log("\n===== APPROVED EXCEPTIONS =====");
    console.log(result.approvedExceptions);

    console.log("\nValid:", result.valid);
}

module.exports = {
    validateSourceData,
    isFixedSession
};
