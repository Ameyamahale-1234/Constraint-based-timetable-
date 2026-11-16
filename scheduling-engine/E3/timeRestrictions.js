
function filterAllowedSlots(candidateSlots, blockedSlots) {
    return candidateSlots.filter(candidate => {
        const slots = Array.isArray(candidate)
            ? candidate
            : [candidate];

        return slots.every(slot => !blockedSlots.includes(slot));
    });
}

module.exports = { filterAllowedSlots };
