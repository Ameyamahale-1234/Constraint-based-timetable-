# ClassSync E3 – implementation notes

## Current architecture

- `data/dataNormalizer.js`: common normalized input model for academic data.
- `data/excelAdapter.js`: accepts parsed XLSX workbook data or already-parsed sheet rows. To parse `.xlsx` files directly, install the optional `xlsx` package in the application that invokes it.
- `data/supabaseAdapter.js`: loads the configured academic tables through an existing Supabase client. It does not create tables or credentials.
- `sessionGenerator.js`: expands course/division requirements into weekly sessions.
- `collegeTimeConfig.js`: owns time slots; Excel/Supabase time-slot rows are not used by the new generation pipeline.
- `scheduler.js` delegates its recursive solver to `backtracking.js`, which invokes `forwardChecking.js` during search.

## Confirmed academic rules

- Theory 3 credits: three separate one-hour sessions per week.
- Theory 4 credits: two two-hour sessions on different days.
- Lab 1 credit: one hour.
- Lab 1.5 credits: two hours.
- Lab 2 credits: four hours.
- Labs must be uninterrupted. Breaks and lunch cannot be crossed.
- Four-hour labs require an explicitly configured `SPECIAL_LAB` block.

## Flexible time configuration

`getCollegeSlots()` keeps the current tested timetable as its default. Admin overrides can provide explicit periods for each day:

```js
const slots = getCollegeSlots({
  workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  dayOverrides: {
    MON: { periods: [
      { start: '08:00', end: '09:00' },
      { start: '09:00', end: '10:00' },
      { start: '10:15', end: '11:15' }
    ] },
    TUE: { periods: [
      { start: '09:00', end: '10:00' },
      { start: '10:00', end: '11:00' }
    ] }
  },
  specialLabSlots: [
    { day: 'MON', start: '13:00', end: '17:00', slotId: 'MON-LAB-4H' }
  ]
});
```

The `periods` array is the authoritative daily schedule for an overridden day. Configure breaks by leaving gaps between periods. The lunch interval is not automatically inferred for explicit `periods`; do not include lunch-time periods. Special lab blocks must be entered only when the institution approves that uninterrupted time.

## Run tests

From the repository root:

```bash
node scheduling-engine/E3/tests/runAllTests.js
```

## Important integration boundaries / remaining application work

- The adapters normalize academic reference data. Supabase table names in `data/supabaseAdapter.js` are defaults and must be aligned with the team's actual Supabase schema.
- Excel parsing needs the optional `xlsx` dependency; the adapter also accepts already-parsed worksheet rows.
- `eligibleFacultyIds` is emitted by session generation as eligibility metadata. The current core scheduler still expects a selected `facultyId`/`facultyIds` on each session; a full teacher-choice search dimension (faculty × room × time) must be added before claiming that the engine automatically chooses among multiple eligible teachers.
- Room selection is likewise currently constrained by `roomId`/room availability supplied to the scheduler; automatic room-choice domains require the same resource-choice expansion.
- Existing `sourceSessionPreparer.js` and the sample fixture tests support the legacy timetable-audit workflow. They are not the new requirements-to-timetable generation pipeline. Do not use sample TTG IDs as institutional rules.
- A live Supabase connection, real production schema, and frontend integration were not available in this offline review and must be tested in the team's environment.
