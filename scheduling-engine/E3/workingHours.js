
function isWithinWorkingHours(slot, workingSlots) {
    return workingSlots.includes(slot);
}

function filterWorkingHours(candidateSlots, workingSlots) {
    return candidateSlots.filter(candidate => {
        const slots = Array.isArray(candidate)
            ? candidate
            : [candidate];

        return slots.every(slot =>
            isWithinWorkingHours(slot, workingSlots)
        );
    });
}

module.exports = {
    isWithinWorkingHours,
    filterWorkingHours
};
