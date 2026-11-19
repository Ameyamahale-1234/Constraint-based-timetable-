// Builds the printable "Class Timetable" sheet (used by the screen view and the PDF).

export const DAY_NAMES = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };

const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function defaultAcademicYear(date = new Date()) {
  const y = date.getFullYear();
  return date.getMonth() >= 5 ? `${y}–${String(y + 1).slice(2)}` : `${y - 1}–${String(y).slice(2)}`;
}

export function divisionLabel(d) {
  if (d.semester == null || d.semester === '') return `Division ${d.name}`;
  // Labels like "4A" already contain the semester: show "Sem 4 – Division A".
  const name = String(d.name).startsWith(String(d.semester)) && String(d.name).length > String(d.semester).length ? String(d.name).slice(String(d.semester).length) : d.name;
  return `Sem ${d.semester} – Division ${name}`;
}

/**
 * Items the user can pick for a view: divisions, teachers or rooms.
 */
export function viewOptions(result, view) {
  if (!result?.timetable?.length) return [];
  if (view === "division") return (result.divisions || []).map(d => ({ value: String(d.id), label: divisionLabel(d) }));
  if (view === "faculty") {
    const map = new Map();
    result.timetable.forEach(r => r.facultyIds.forEach((id, i) => map.set(id, r.facultyNames[i])));
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }
  const map = new Map(result.timetable.map(r => [r.roomId, r.roomName]));
  return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function rowsFor(result, view, value) {
  if (!result?.timetable) return [];
  if (view === "division") return result.timetable.filter(r => String(r.divisionId) === value);
  if (view === "faculty") return result.timetable.filter(r => r.facultyIds.includes(value));
  return result.timetable.filter(r => r.roomId === value);
}

/** Header fields shown above the table. */
export function headerFields(result, view, value, { department, academicYear }) {
  const fields = [["Department", department || "—"]];
  if (view === "division") {
    const d = (result.divisions || []).find(x => String(x.id) === value);
    fields.push(["Semester", d?.semester ?? "—"], ["Division", d?.name ?? "—"]);
  } else if (view === "faculty") {
    fields.push(["Teacher", viewOptions(result, view).find(o => o.value === value)?.label || "—"]);
  } else {
    fields.push(["Room", viewOptions(result, view).find(o => o.value === value)?.label || "—"]);
  }
  fields.push(["Academic Year", academicYear || "—"]);
  return fields;
}

/** The lines of text describing one session in a cell, depending on the view. */
export function entryLines(r, view, result) {
  const division = (result.divisions || []).find(d => String(d.id) === String(r.divisionId));
  const who = division ? (division.semester != null ? `Sem ${division.semester} · ${division.name}` : `Div ${division.name}`) : `Div ${r.divisionName}`;
  const title = r.courseType === "LAB" ? `${r.courseName} (${r.batch})` : r.courseName;
  const lines = [title];
  if (view !== "division") lines.push(r.courseType === "LAB" ? `${who} · ${r.batch}` : who);
  if (view !== "faculty") lines.push(r.facultyNames.join(" & "));
  if (view !== "room") lines.push(`Room ${r.roomName}`);
  if (r.start !== undefined) lines.push(`${r.start}–${r.end}`);
  return lines;
}

/**
 * Sheet structure: one row per college period, with the lunch break inserted
 * as a full-width band. A session appears in every period it overlaps; after
 * its first row it is marked as continued.
 */
export function buildSheet(result, rows) {
  const layout = result.layout;
  const days = layout.days.filter(d => d !== "SUN" || rows.some(r => r.day === "SUN"));
  const lunch = layout.lunch;
  const out = [];
  const seen = new Map(days.map(d => [d, new Set()]));
  let lunchDone = !lunch;
  for (const p of layout.periods) {
    if (!lunchDone && toMin(p.start) >= toMin(lunch.end)) {
      out.push({ type: "lunch", start: lunch.start, end: lunch.end });
      lunchDone = true;
    }
    const key = `${p.start}-${p.end}`;
    const cells = days.map(day => {
      const open = (layout.periodsByDay[day] || []).includes(key);
      const entries = rows
        .filter(r => r.day === day && toMin(r.start) < toMin(p.end) && toMin(r.end) > toMin(p.start))
        .sort((a, b) => a.start.localeCompare(b.start) || String(a.batch).localeCompare(String(b.batch)))
        .map(r => {
          const continued = seen.get(day).has(r.sessionId);
          seen.get(day).add(r.sessionId);
          return { row: r, continued };
        });
      return { day, open, entries };
    });
    out.push({ type: "period", start: p.start, end: p.end, cells });
  }
  if (!lunchDone) out.push({ type: "lunch", start: lunch.start, end: lunch.end });
  return { days, rows: out };
}
