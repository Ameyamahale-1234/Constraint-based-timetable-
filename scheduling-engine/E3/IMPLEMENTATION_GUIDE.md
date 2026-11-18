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

## Resource-aware timetable generation (greedy + backtracking)

```js
const { generateTimetableFromData } = require('./resourceScheduler');

const result = generateTimetableFromData(rawAcademicData, {
  timeLimitMs: 60000,            // hard limit; the engine never runs longer
  // timeConfig: { ... },        // college periods (see "Flexible time configuration")
  // labWindow: { start: '08:00', end: '12:00' },   or labWindows: [{ start, end, days }]
  // labBatchesPerDivision: 2,   // default batch count when a division does not say
  // maxFacultyHoursPerDay: 5,   // default limit when a teacher record does not say
  // maxFacultyHoursPerWeek: 18,
  // sameFacultyForCourse: true, // a course-division keeps the same teacher all week
  // seed: 1                     // makes results reproducible
  // preferenceWeights: { sameCourseTime: 150, divisionTime: 30, gapPerMinute: 0.6 }
  //   soft preferences for timetable variety (theory classes): avoid the same
  //   course at the same time on different days, spread a division's classes
  //   over the whole day, avoid long idle gaps. Set a weight to 0 to disable it.
});
```

Raw data is normalized and validated inside the call, so Excel rows, Supabase rows or JSON can be passed directly.

### How it works

1. **Input validation**: duplicate IDs, missing fields and broken references (a mapping that points to an unknown course, division or teacher) stop the run with a clear list of errors. All IDs are compared as trimmed strings, so `4`, `"4"` and `"4.0"` are the same teacher.
2. **Session generation**: one 1-period session per theory credit (on different days, same teacher), one lab session per batch (1, 2 or 3 uninterrupted hours inside the lab window).
3. **Options per session**: eligible teacher(s) × legal time blocks, filtered by availability and hour limits; suitable rooms by type and capacity.
4. **Feasibility checks** (`feasibilityChecker.js`) catch impossible data in milliseconds, for example: a course with more weekly sessions than days, a teacher or group of teachers with more hours than they can teach, a division or batch with more hours than the week has, too few rooms of a type, or fixed sessions that collide.
5. **Greedy construction**: the most constrained session (fewest options left) is placed next, at the least loaded day and time for its division and teacher.
6. **Backtracking** with forward checking runs only when greedy gets stuck. It restarts with randomized ordering and learns from failures: sessions that caused dead ends get placed earlier. The time limit is always respected.
7. **Independent audit** (`finalTimetableValidator.js`) re-checks every hard rule. `success` is `true` only if the audit passes.

### Result

| field | meaning |
|---|---|
| `success` | `true` only when a complete timetable passed the independent audit |
| `stage` | `DONE`, `INPUT_VALIDATION`, `SESSION_GENERATION`, `FEASIBILITY`, `NO_SOLUTION` (proven impossible), `TIME_LIMIT`, `FINAL_VALIDATION` |
| `errors` | human-readable reasons when `success` is `false` |
| `warnings` | non-fatal notes (e.g. a room pool that is 95% full) |
| `assignments` | `Map(sessionId → { slots, day, start, end, facultyId, facultyIds, roomId })` |
| `timetable` | JSON-ready rows sorted by day and time, ready to send to a web front end |
| `partialAssignments`, `unplacedSessions`, `diagnostics.hardestSessions` | on `TIME_LIMIT` / `NO_SOLUTION`: what was placed and which sessions blocked the rest |
| `validation` | the full audit report |
| `stats` | sessions placed greedily, backtracks, restarts, time |

### Optional input fields

| record | fields (any of the listed spellings) |
|---|---|
| course | `faculty_per_session` (team teaching), `split_batches` (`false` = whole-division lab), `required_room_type`, `duration_hours` (labs: 1, 2 or 3) |
| division | `batches` (`"A1, A2, A3"`) or `batch_count`; `student_count` / `strength` |
| room | `capacity` |
| faculty | `max_hours_per_day`, `max_hours_per_week` |
| courseFaculty | `division_batch` may name divisions (`"A, B"`), division IDs or batches (`"B1, B2"`); a batch is taught by its batch teachers and the division's teachers |
| facultyAvailability / roomAvailability | rows `{ faculty_id, day, start, end, available }` or `{ faculty_id, day, slotId }`; `available: false` blocks time; a resource with no rows is always available |
| fixedAssignments | `{ course_id, division_id, batch?, occurrence?, day, start | slotId, faculty_id?, room_id? }` pins a session |

Lab batches are named after their division (`A1`, `A2`, `B1`, …). Availability is compared by day and clock time, so a teacher available in class periods is also available for lab hours at the same time. Gaps of 30 minutes or less, such as a short break, are bridged.

### Limits (honest guarantees)

- Every run ends within `timeLimitMs` with either an audited timetable or a reason.
- Timetabling is NP-hard. Data that passes every feasibility check but leaves almost no slack (for example lab rooms 100% full) can still need more search time; the result then says `TIME_LIMIT` and lists the nearly-full resources. Raise `timeLimitMs` or add slack.
- Elective sessions shared by several divisions are not modelled yet.

## Legacy APIs

The original `generateTimetable(sessions, ...)` in `scheduler.js` (slot-only scheduling) and the source-timetable audit tools (`sourceSessionPreparer.js`, `sourceDataValidator.js`) remain for their existing tests. Their backtracking now also has a time limit (`options.timeLimitMs`, default 60 s).

Supabase table names in `data/supabaseAdapter.js` are defaults and must be aligned with the team's actual schema; a live Supabase connection was not available in this offline review.
