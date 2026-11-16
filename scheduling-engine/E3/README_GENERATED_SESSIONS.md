# E3: Credit-based session generation

## Data source rule

E3 generates a new weekly session list from academic master data. It does **not** read or copy rows from the `Timetable` sheet. The workbook's `Department`, `Faculty`, `Course`, `Division`, `Room`, `Course_Faculty (teaches)` and `Course_Division (offered to)` sheets are the source tables. `Time_Slot` is not used as a set of fixed assignments; the college time configuration in `collegeTimeConfig.js` controls generated slots.

`fixtures/academic_input_example.json` is an example export of those master-data sheets only. It is sample data and must be replaced with current authoritative data before production scheduling.

## Weekly credit rules implemented

- Theory: one 1-hour session per credit (1, 2, 3, 4 credits produce 1, 2, 3, 4 sessions).
- Lab: 1 credit = one 1-hour lab; 1.5 or 2 credits = one 2-hour lab; 3 credits = one 3-hour lab.
- Unsupported lab credit values fail validation. Four-hour labs are not generated.
- Each lab offering generates separate A1 and A2 sessions.
- Theory/project offerings are full-division sessions (A1/A2 merged).
- Lab candidate time is an uninterrupted window from 08:00 to 12:00, Monday through Saturday. The lab window does not insert the normal 15-minute break into a lab block.
- Normal theory periods continue to use the college time configuration, including the 15-minute breaks, 12:30–13:30 lunch and Saturday half-day.

## Run generation and tests

From this E3 folder, point the runner at your current academic master-data JSON (not the sample timetable):

```bash
node runGeneratedSchedule.js path/to/academic-input.json
node tests/runAllTests.js
```

To run the bundled test-data demonstration only:

```bash
node runGeneratedSchedule.js --demo
```

To also invoke the resource-aware CSP scheduler:

```bash
node runGeneratedSchedule.js path/to/academic-input.json --schedule
```

The example workbook data is deliberately not a guarantee that a complete timetable is feasible. Feasibility depends on the current faculty mappings, room inventory, workload and college constraints. The default command validates the generated sessions without pretending that a schedule has been solved.

## Load a real XLSX workbook

The existing `data/excelAdapter.js` accepts an XLSX workbook object when the `xlsx` package is available in the consuming application:

```js
const XLSX = require('xlsx');
const { loadExcelData } = require('./data/excelAdapter');
const workbook = XLSX.readFile('academic-data.xlsx');
const normalized = loadExcelData(workbook);
```

Then validate and generate sessions:

```js
const { validateNormalizedData } = require('./data/dataNormalizer');
const { generateSessions } = require('./sessionGenerator');
const check = validateNormalizedData(normalized);
if (!check.valid) throw new Error(check.errors.join('\n'));
const sessions = generateSessions(normalized);
```
