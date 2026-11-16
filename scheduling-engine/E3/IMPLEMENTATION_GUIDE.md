# ClassSync E3 – implementation notes

## Current architecture

- `data/dataNormalizer.js`: common normalized input model for academic data.
- `data/excelAdapter.js`: accepts parsed XLSX workbook data or already-parsed sheet rows. To parse `.xlsx` files directly, install the optional `xlsx` package in the application that invokes it.
- `data/supabaseAdapter.js`: loads the configured academic tables through an existing Supabase client. It does not create tables or credentials.
- `sessionGenerator.js`: expands course/division requirements into weekly sessions.
- `collegeTimeConfig.js`: owns time slots; Excel/Supabase time-slot rows are not used by the new generation pipeline.
- `scheduler.js` delegates its recursive solver to `backtracking.js`, which invokes `forwardChecking.js` during search.

## Confirmed academic rules

- Theory: one one-hour session per credit per week (for example, 3 credits = 3 sessions and 4 credits = 4 sessions).
- Lab 1 credit: one hour.
- Lab 1.5 credits: one uninterrupted two-hour session.
- Lab 2 credits: one uninterrupted two-hour session.
- Lab 3 credits: one uninterrupted three-hour session.
- Labs run uninterrupted within the 08:00–12:00 lab window. The ordinary 15-minute break is not inserted into that lab window; the window ends before lunch.
- Lab sessions are restricted to one, two or three hours; four-hour labs are not generated.

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

## Resource-aware timetable generation

The original `generateTimetable(sessions, ...)` API remains available for legacy slot-only scheduling and its existing tests.

For new academic-data-driven generation, use the resource-aware entry point:

```js
const { normalizeData } = require('./data/dataNormalizer');
const { generateTimetableFromData } = require('./scheduler');

const normalized = normalizeData(rawAcademicData);
const result = generateTimetableFromData(normalized, {
  // Optional: override the default code-generated college slots.
  // availableSlots: getCollegeSlots(customTimeConfig)
});

if (!result.success) {
  console.error(result.errors);
} else {
  // Each assignment contains { slots, facultyId, roomId }.
  console.log([...result.assignments]);
}
```

This path creates candidate combinations of eligible faculty, suitable rooms and valid time groups, then applies MRV backtracking with forward checking. Theory sessions require classroom-type rooms; lab sessions require lab-type rooms. Labs use uninterrupted one-, two- or three-hour blocks within the 08:00–12:00 lab window. The returned `assignments` map stores each combined assignment as `{ slots, facultyId, roomId }`.

Availability inputs may be supplied through `options.facultyAvailability` and `options.roomAvailability` as maps keyed by resource ID, where each value is an array of allowed slot objects. The normalized data arrays `facultyAvailability` and `roomAvailability` are also supported when each row contains a resource ID and a `slot`, `timeSlot`, or slot-shaped record.
