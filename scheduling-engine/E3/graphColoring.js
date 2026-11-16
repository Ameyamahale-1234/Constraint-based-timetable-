
function graphColoring(graph, availableSlots) {

    const assignedSlots = new Map();

    // Step 1: Sort vertices by descending degree
    const vertices = [...graph.keys()].sort(
        (a, b) => graph.get(b).length - graph.get(a).length
    );

    // Step 2: Assign slots to vertices
    for (const vertex of vertices) {

        // Find slots already used by neighbouring vertices
        const usedSlots = new Set();

        for (const edge of graph.get(vertex)) {

            if (assignedSlots.has(edge.sessionId)) {
                usedSlots.add(assignedSlots.get(edge.sessionId));
            }
        }

        // Step 3: Find the first available color
        const availableColor = availableSlots.find(
            slot => !usedSlots.has(slot)
        );

        // Step 4: Handle unassigned vertices
        if (availableColor === undefined) {
            return {
                success: false,
                assignments: assignedSlots,
                failedVertex: vertex
            };
        }

        assignedSlots.set(vertex, availableColor);
    }

    return {
        success: true,
        assignments: assignedSlots,
        failedVertex: null
    };
}

module.exports = { graphColoring };
