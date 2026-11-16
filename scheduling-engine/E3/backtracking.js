const { forwardChecking, hasOverlap, hasConstraintConflict } = require('./forwardChecking');

function selectNextSession(graph, domains, assignments) {
  const remaining = [...domains.keys()].filter(id => !assignments.has(id));
  remaining.sort((a, b) => {
    const da = (domains.get(a) || []).length;
    const db = (domains.get(b) || []).length;
    if (da !== db) return da - db; // MRV
    const degree = id => (graph.get(id) || []).filter(e => !assignments.has(e.sessionId)).length;
    return degree(b) - degree(a); // Degree tie-break
  });
  return remaining[0];
}

function backtracking(graph, domains, initialAssignments = new Map()) {
  const initial = new Map(initialAssignments);
  // Verify pinned assignments against one another.
  const pinned = [...initial.entries()];
  for (let i = 0; i < pinned.length; i++) for (let j = i + 1; j < pinned.length; j++) {
    const [a, av] = pinned[i], [b, bv] = pinned[j];
    const edge = (graph.get(a) || []).find(e => e.sessionId === b);
    if (edge && hasConstraintConflict(edge, av, bv)) return null;
  }
  const seededDomains = new Map([...domains].map(([id, values]) => [id, [...values]]));
  for (const [id, value] of initial) seededDomains.set(id, [value]);

  function solve(currentDomains, assignments) {
    if (assignments.size === domains.size) return new Map(assignments);
    const id = selectNextSession(graph, currentDomains, assignments);
    if (id === undefined) return null;
    for (const candidate of currentDomains.get(id) || []) {
      let conflict = false;
      for (const edge of graph.get(id) || []) {
        if (assignments.has(edge.sessionId) && hasConstraintConflict(edge, candidate, assignments.get(edge.sessionId))) { conflict = true; break; }
      }
      if (conflict) continue;
      const nextAssignments = new Map(assignments);
      nextAssignments.set(id, candidate);
      const pruned = forwardChecking(graph, currentDomains, id, candidate, nextAssignments);
      if (!pruned.success) continue;
      const result = solve(pruned.domains, nextAssignments);
      if (result) return result;
    }
    return null;
  }
  return solve(seededDomains, initial);
}

module.exports = { backtracking, selectNextSession };
