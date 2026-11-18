const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_CONFIG = {
  workingDays: DAYS,
  defaultWorkingHours: { start: '08:00', end: '17:45' },
  saturdayWorkingHours: { start: '08:00', end: '12:15' },
  periodDurationMinutes: 60,
  breakDurationMinutes: 15,
  breakAfterPeriods: 2,
  lunch: { start: '12:30', end: '13:30' },
  // Preserves the college's currently tested 8 weekday + 4 Saturday slots.
  dayOverrides: null,
  specialLabSlots: []
};

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`Invalid time: ${value}`);
  return h * 60 + m;
}
function minutesToTime(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function overlaps(a, b, c, d) { return a < d && c < b; }

function generateDaySlots(day, hours, config, firstId) {
  const start = timeToMinutes(hours.start), end = timeToMinutes(hours.end);
  const slots = []; let cursor = start, id = firstId, periodsSinceBreak = 0;
  const lunchStart = config.lunch ? timeToMinutes(config.lunch.start) : null;
  const lunchEnd = config.lunch ? timeToMinutes(config.lunch.end) : null;
  while (cursor + config.periodDurationMinutes <= end) {
    const periodEnd = cursor + config.periodDurationMinutes;
    if (lunchStart !== null && overlaps(cursor, periodEnd, lunchStart, lunchEnd)) {
      cursor = Math.max(cursor, lunchEnd); periodsSinceBreak = 0; continue;
    }
    slots.push({ slotId: id++, day, start: minutesToTime(cursor), end: minutesToTime(periodEnd), startMinutes: cursor, endMinutes: periodEnd, durationMinutes: config.periodDurationMinutes, type: 'CLASS' });
    cursor = periodEnd; periodsSinceBreak++;
    if (periodsSinceBreak === config.breakAfterPeriods && cursor + config.breakDurationMinutes < end) { cursor += config.breakDurationMinutes; periodsSinceBreak = 0; }
  }
  return slots;
}

function getCollegeSlots(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides, lunch: overrides.lunch === undefined ? DEFAULT_CONFIG.lunch : overrides.lunch };
  const slots = [];
  let nextId = 1;
  const hasCustomDays = Boolean(config.dayOverrides);
  const legacyTimes = [
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['13:30','14:30'],['14:30','15:30'],['15:45','16:45'],['16:45','17:45']],
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['13:30','14:30'],['14:30','15:30'],['15:45','16:45'],['16:45','17:45']],
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['13:30','14:30'],['14:30','15:30'],['15:45','16:45'],['16:45','17:45']],
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['13:30','14:30'],['14:30','15:30'],['15:45','16:45'],['16:45','17:45']],
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['13:30','14:30'],['14:30','15:30'],['15:45','16:45'],['16:45','17:45']],
    [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15']]
  ];
  for (const [index, day] of (config.workingDays || DAYS).entries()) {
    const setting = config.dayOverrides?.[day];
    let daySlots;
    if (!hasCustomDays && !overrides.defaultWorkingHours && !overrides.saturdayWorkingHours) {
      daySlots = (legacyTimes[index] || []).map(([start, end]) => {
        const startMinutes = timeToMinutes(start), endMinutes = timeToMinutes(end);
        return { slotId: nextId++, day, start, end, startMinutes, endMinutes, durationMinutes: endMinutes - startMinutes, type: 'CLASS' };
      });
    } else if (setting?.periods) {
      daySlots = setting.periods.map(period => {
        const startMinutes = timeToMinutes(period.start), endMinutes = timeToMinutes(period.end);
        return { slotId: period.slotId ?? nextId++, day, start: period.start, end: period.end, startMinutes, endMinutes, durationMinutes: endMinutes - startMinutes, type: 'CLASS' };
      });
      nextId += daySlots.length;
    } else {
      const hours = setting || (day === 'SAT' ? config.saturdayWorkingHours : config.defaultWorkingHours);
      if (!hours) continue;
      daySlots = generateDaySlots(day, hours, config, nextId);
      nextId += daySlots.length;
    }
    slots.push(...daySlots);
  }
  for (const special of config.specialLabSlots || []) {
    const startMinutes = timeToMinutes(special.start), endMinutes = timeToMinutes(special.end);
    if (endMinutes <= startMinutes) throw new Error(`Invalid special lab slot on ${special.day}`);
    slots.push({ ...special, slotId: special.slotId ?? `SPECIAL-${special.day}-${special.start}`, startMinutes, endMinutes, durationMinutes: endMinutes - startMinutes, type: 'SPECIAL_LAB' });
  }
  return slots;
}

function getConsecutiveSlotGroups(slots, requiredHours) {
  const requiredMinutes = Number(requiredHours) * 60;
  if (!Number.isFinite(requiredMinutes) || requiredMinutes <= 0) return [];
  const groups = [];
  // Special uninterrupted blocks are explicitly configured and do not need to be split into periods.
  for (const slot of slots) if (slot.type === 'SPECIAL_LAB' && slot.durationMinutes >= requiredMinutes) groups.push([slot]);
  const byDay = new Map();
  for (const slot of slots) {
    if (slot.type === 'SPECIAL_LAB') continue;
    if (!byDay.has(slot.day)) byDay.set(slot.day, []);
    byDay.get(slot.day).push(slot);
  }
  for (const daySlots of byDay.values()) {
    daySlots.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 0; i < daySlots.length; i++) {
      const group = [daySlots[i]]; let total = daySlots[i].durationMinutes;
      if (total === requiredMinutes) { groups.push(group); continue; }
      for (let j = i + 1; j < daySlots.length; j++) {
        const previous = group[group.length - 1], current = daySlots[j];
        if (previous.endMinutes !== current.startMinutes) break;
        group.push(current); total += current.durationMinutes;
        if (total === requiredMinutes) { groups.push([...group]); break; }
        if (total > requiredMinutes) break;
      }
    }
  }
  return groups;
}


function getLabWindowSlots(options = {}) {
  const days = options.days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const start = timeToMinutes(options.start || '08:00');
  const end = timeToMinutes(options.end || '12:00');
  const duration = options.periodDurationMinutes || 60;
  const slots = [];
  for (const day of days) {
    for (let cursor = start; cursor + duration <= end; cursor += duration) {
      slots.push({
        slotId: `LAB-${day}-${cursor}`, day,
        start: minutesToTime(cursor), end: minutesToTime(cursor + duration),
        startMinutes: cursor, endMinutes: cursor + duration,
        durationMinutes: duration, type: 'LAB_WINDOW'
      });
    }
  }
  return slots;
}

function getLabWindowGroups(slots, requiredHours) {
  const requiredMinutes = Number(requiredHours) * 60;
  if (![60, 120, 180].includes(requiredMinutes)) return [];
  const groups = [];
  const byDay = new Map();
  for (const slot of slots) {
    if (!byDay.has(slot.day)) byDay.set(slot.day, []);
    byDay.get(slot.day).push(slot);
  }
  for (const daySlots of byDay.values()) {
    daySlots.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 0; i < daySlots.length; i++) {
      const group = [];
      let total = 0;
      for (let j = i; j < daySlots.length; j++) {
        if (group.length && group[group.length - 1].endMinutes !== daySlots[j].startMinutes) break;
        group.push(daySlots[j]);
        total += daySlots[j].durationMinutes;
        if (total === requiredMinutes) { groups.push([...group]); break; }
        if (total > requiredMinutes) break;
      }
    }
  }
  return groups;
}

module.exports = { DAYS, DEFAULT_CONFIG, timeToMinutes, getCollegeSlots, getConsecutiveSlotGroups, getLabWindowSlots, getLabWindowGroups };
