/**
 * ClassSync API server (no framework, only Node's http module).
 *
 *   GET  /api/health            -> { ok: true }
 *   GET  /api/sample            -> sample Excel workbook (download)
 *   POST /api/import            -> body JSON { fileBase64, divisions } -> E1 data (courses, faculty, rooms, divisions, assignments)
 *   POST /api/generate          -> body JSON { data: <E1 data> | fileBase64 + divisions, collegeName, timeLimitSeconds }
 *
 * If ../frontend/dist exists (after `npm run build` in frontend/), the built
 * web app is served from the same port, so one command runs everything.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { readWorkbook, applyDivisionCount, UserError } = require('./excelImport');
const { generateTimetableFromData } = require('../scheduling-engine/E3/resourceScheduler');
const { createSampleWorkbook, SAMPLE_PATH } = require('./createSampleWorkbook');
const { getCollegeSlots, DEFAULT_CONFIG } = require('../scheduling-engine/E3/collegeTimeConfig');
const { rawToE1, e1ToRaw } = require('./e1Adapter');

/** The college's period layout, used by the printable timetable sheet. */
function collegeLayout(timeConfig) {
  const slots = getCollegeSlots(timeConfig || {});
  const days = [...new Set(slots.map(s => s.day))];
  const periods = [...new Map(slots.map(s => [`${s.start}-${s.end}`, { start: s.start, end: s.end }])).values()]
    .sort((a, b) => a.start.localeCompare(b.start));
  const periodsByDay = Object.fromEntries(days.map(d => [d, slots.filter(s => s.day === d).map(s => `${s.start}-${s.end}`)]));
  return { days, periods, periodsByDay, lunch: timeConfig && timeConfig.lunch !== undefined ? timeConfig.lunch : DEFAULT_CONFIG.lunch };
}
const { createLargeSampleWorkbook, LARGE_SAMPLE_PATH } = require('./createLargeSampleWorkbook');

const PORT = Number(process.env.PORT || 5050);
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', ...headers });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new UserError('The uploaded file is too large (limit 15 MB).')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function decodeWorkbook(fileBase64) {
  if (!fileBase64) throw new UserError('Please choose an Excel file.');
  return readWorkbook(Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64'));
}

/** Excel workbook -> E1 data for the data-entry pages. */
function importWorkbook(body) {
  const { raw, found } = decodeWorkbook(body?.fileBase64);
  const { notes } = applyDivisionCount(raw, body?.divisions);
  const data = rawToE1(raw);
  return { data, notes, sheetsUsed: found, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) };
}

function generate(body) {
  const { fileBase64, divisions, collegeName, timeLimitSeconds } = body || {};
  const limit = Math.min(Math.max(Number(timeLimitSeconds) || 60, 5), 300);
  let raw, found = null, scheduled, notes = [], options = {};
  if (body && body.data) {
    // Generate from the data entered / imported on the E1 pages.
    ({ raw, options } = e1ToRaw(body.data));
    raw.department = [];
    scheduled = raw.divisions.map(d => ({ id: d.division_id, name: d.division_name, semester: d.semester }));
  } else {
    ({ raw, found } = decodeWorkbook(fileBase64));
    ({ divisions: scheduled, notes } = applyDivisionCount(raw, divisions));
  }

  const result = generateTimetableFromData(raw, { ...options, timeLimitMs: limit * 1000 });

  const facultyNames = Object.fromEntries(raw.faculty.map(f => [String(f.faculty_id ?? f.facultyId ?? f.id).trim(), f.faculty_name ?? f.name ?? String(f.faculty_id)]));
  const roomNames = Object.fromEntries(raw.rooms.map(r => [String(r.room_id ?? r.roomId ?? r.id).trim(), r.room_name ?? r.name ?? String(r.room_id)]));
  return {
    collegeName: collegeName || 'College',
    department: (raw.department[0] && (raw.department[0].dept_name || raw.department[0].department_name || raw.department[0].name)) || null,
    layout: collegeLayout(options.timeConfig),
    success: result.success,
    stage: result.stage,
    errors: result.errors || [],
    warnings: [...notes, ...(result.warnings || [])],
    sheetsUsed: found,
    divisions: scheduled,
    summary: {
      sessions: result.sessions?.length || 0,
      placed: result.assignments?.size || result.partialAssignments?.size || 0,
      courses: new Set((result.sessions || []).map(s => s.courseId)).size,
      faculty: raw.faculty.length,
      rooms: raw.rooms.length,
      timeMs: result.stats?.timeMs ?? null,
      greedyPlaced: result.stats?.greedyPlaced ?? null,
      backtracks: result.stats?.backtracks ?? null,
      auditPassed: result.validation?.valid ?? false
    },
    hardestSessions: result.diagnostics?.hardestSessions || [],
    audit: result.validation ? { conflicts: result.validation.conflicts, ruleViolations: result.validation.ruleViolations, totalErrors: result.validation.totalErrors } : null,
    timetable: (result.timetable || []).map(row => ({
      ...row,
      facultyNames: row.facultyIds.map(id => facultyNames[id] || id),
      roomName: roomNames[row.roomId] || row.roomId
    }))
  };
}

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) return send(res, 404, { error: 'Not found. Run the frontend with "npm run dev" in frontend/, or build it with "npm run build".' });
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(DIST, urlPath));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.url === '/api/health') return send(res, 200, { ok: true });
    if (req.url === '/api/sample' && req.method === 'GET') {
      if (!fs.existsSync(SAMPLE_PATH)) createSampleWorkbook();
      return send(res, 200, fs.readFileSync(SAMPLE_PATH), {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ClassSync_sample_input.xlsx"'
      });
    }
    if (req.url === '/api/sample-large' && req.method === 'GET') {
      if (!fs.existsSync(LARGE_SAMPLE_PATH)) createLargeSampleWorkbook();
      return send(res, 200, fs.readFileSync(LARGE_SAMPLE_PATH), {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ClassSync_large_sample_input.xlsx"'
      });
    }
    if (req.url === '/api/import' && req.method === 'POST') {
      const text = await readBody(req);
      let body;
      try { body = JSON.parse(text); } catch { throw new UserError('Invalid request body.'); }
      return send(res, 200, importWorkbook(body));
    }
    if (req.url === '/api/generate' && req.method === 'POST') {
      const text = await readBody(req);
      let body;
      try { body = JSON.parse(text); } catch { throw new UserError('Invalid request body.'); }
      const started = Date.now();
      const out = generate(body);
      console.log(`[generate] ${out.collegeName}: ${out.success ? 'SUCCESS' : out.stage} ${out.summary.placed}/${out.summary.sessions} sessions in ${Date.now() - started} ms`);
      return send(res, 200, out);
    }
    if (req.url.startsWith('/api/')) return send(res, 404, { error: 'Unknown API route' });
    return serveStatic(req, res);
  } catch (error) {
    if (error instanceof UserError) return send(res, 400, { success: false, stage: 'UPLOAD', errors: [error.message], warnings: [], timetable: [] });
    console.error(error);
    return send(res, 500, { success: false, stage: 'SERVER_ERROR', errors: [`Unexpected server error: ${error.message}`], warnings: [], timetable: [] });
  }
});

server.listen(PORT, () => {
  console.log(`ClassSync API running at http://localhost:${PORT}`);
  if (fs.existsSync(DIST)) console.log(`Web app served at http://localhost:${PORT}`);
});
