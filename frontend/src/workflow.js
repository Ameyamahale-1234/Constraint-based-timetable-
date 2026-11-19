// Workflow: enter/import data (E1) -> validate (E2) -> generate with E3 -> independent conflict audit -> coordinator approval
// -> faculty/students view the approved timetable.
export const STEPS = ['Enter or import academic data (E1)', 'Validate data (E2)', 'Generate timetable (E3)', 'Conflict audit', 'Coordinator approval']
export const DONE = { none: 1, failed: 2, conflict_free: 4, approved: 5 }
export const LABEL = {
  none: 'Not generated',
  failed: 'Generation failed — see Conflict Reports',
  conflict_free: 'Conflict-free, awaiting approval',
  approved: 'Approved',
}
// result: the last /api/generate response; conflicts: problems shown on Conflict Reports.
export const INITIAL = { status: 'none', conflicts: [], result: null, generatedAt: null }

/** Turns an E3 response into the workflow state. */
export function fromResult(result) {
  const conflicts = result.success
    ? []
    : (result.errors || []).map((details) => ({ type: stageLabel(result.stage), details, division: '', state: 'Open' }))
  return { status: result.success ? 'conflict_free' : 'failed', conflicts, result, generatedAt: new Date().toISOString() }
}

export function stageLabel(stage) {
  return {
    INPUT_VALIDATION: 'Invalid data', SESSION_GENERATION: 'Invalid data', FEASIBILITY: 'Impossible constraint',
    NO_SOLUTION: 'No solution', TIME_LIMIT: 'Time limit', FINAL_VALIDATION: 'Audit failure', UPLOAD: 'Upload', CONNECTION: 'Connection',
  }[stage] || stage || 'Problem'
}
