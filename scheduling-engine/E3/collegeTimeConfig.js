
/*
 * E3 - Scheduling & Conflict Resolution
 * Module: College Time Configuration
 *
 * Features:
 * 1. Configurable working days
 * 2. Variable number of periods per day
 * 3. Custom period definitions using dayOverrides.periods
 * 4. Configurable period duration
 * 5. Break after every specified number of periods
 * 6. Fixed lunch break
 * 7. Saturday half-day
 * 8. Special uninterrupted laboratory slots
 * 9. Consecutive slot generation for labs
 */

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

const DEFAULT_CONFIG = {
    workingDays: DAYS,

    defaultWorkingHours: {
        start: "08:00",
        end: "17:45"
    },

    saturdayWorkingHours: {
        start: "08:00",
        end: "12:15"
    },

    periodDurationMinutes: 60,
    breakDurationMinutes: 15,
    breakAfterPeriods: 2,

    lunch: {
        start: "12:30",
        end: "13:30"
    },

    // Supports either:
    // MON: { start: "08:00", end: "17:45", periodCount: 6 }
    //
    // OR:
    // MON: {
    //   periods: [
    //     { start: "08:00", end: "09:00" },
    //     { start: "09:00", end: "10:00" }
    //   ]
    // }
    dayOverrides: null,

    // Explicit uninterrupted laboratory blocks.
    specialLabSlots: []
};


// --------------------------------------------------
// 1. TIME UTILITIES
// --------------------------------------------------

function timeToMinutes(value) {
    const parts = String(value).split(":");

    if (parts.length !== 2) {
        throw new Error(`Invalid time: ${value}`);
    }

    const [hour, minute] = parts.map(Number);

    if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        throw new Error(`Invalid time: ${value}`);
    }

    return hour * 60 + minute;
}


function minutesToTime(value) {
    return (
        String(Math.floor(value / 60)).padStart(2, "0") +
        ":" +
        String(value % 60).padStart(2, "0")
    );
}


function overlaps(a, b, c, d) {
    return a < d && c < b;
}


// --------------------------------------------------
// 2. CONFIGURATION VALIDATION
// --------------------------------------------------

function validateConfig(config) {
    const errors = [];

    if (
        !Number.isFinite(config.periodDurationMinutes) ||
        config.periodDurationMinutes <= 0
    ) {
        errors.push("Period duration must be positive");
    }

    if (
        !Number.isFinite(config.breakDurationMinutes) ||
        config.breakDurationMinutes < 0
    ) {
        errors.push("Break duration cannot be negative");
    }

    if (
        !Number.isInteger(config.breakAfterPeriods) ||
        config.breakAfterPeriods <= 0
    ) {
        errors.push("breakAfterPeriods must be a positive integer");
    }

    if (
        !Array.isArray(config.workingDays) ||
        config.workingDays.length === 0
    ) {
        errors.push("At least one working day is required");
    }

    for (const day of config.workingDays || []) {
        if (!DAYS.includes(day)) {
            errors.push(`Invalid working day: ${day}`);
        }
    }

    if (config.lunch) {
        const lunchStart = timeToMinutes(config.lunch.start);
        const lunchEnd = timeToMinutes(config.lunch.end);

        if (lunchEnd <= lunchStart) {
            errors.push("Lunch end must be after lunch start");
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}


// --------------------------------------------------
// 3. GENERATE SLOTS FOR ONE DAY
// --------------------------------------------------

function generateDaySlots(day, hours, config, firstId) {
    const start = timeToMinutes(hours.start);
    const end = timeToMinutes(hours.end);

    if (end <= start) {
        throw new Error(`Invalid working hours for ${day}`);
    }

    const slots = [];

    let cursor = start;
    let id = firstId;
    let periodsSinceBreak = 0;

    const maxPeriods =
        hours.periodCount === undefined
            ? Infinity
            : hours.periodCount;

    if (
        maxPeriods !== Infinity &&
        (!Number.isInteger(maxPeriods) || maxPeriods < 0)
    ) {
        throw new Error(`Invalid periodCount for ${day}`);
    }

    const lunchStart = config.lunch
        ? timeToMinutes(config.lunch.start)
        : null;

    const lunchEnd = config.lunch
        ? timeToMinutes(config.lunch.end)
        : null;

    while (
        slots.length < maxPeriods &&
        cursor + config.periodDurationMinutes <= end
    ) {
        const periodEnd =
            cursor + config.periodDurationMinutes;

        // Skip lunch.
        if (
            lunchStart !== null &&
            overlaps(
                cursor,
                periodEnd,
                lunchStart,
                lunchEnd
            )
        ) {
            cursor = Math.max(cursor, lunchEnd);
            periodsSinceBreak = 0;
            continue;
        }

        slots.push({
            slotId: id++,
            day,
            start: minutesToTime(cursor),
            end: minutesToTime(periodEnd),
            startMinutes: cursor,
            endMinutes: periodEnd,
            durationMinutes: config.periodDurationMinutes,
            type: "CLASS"
        });

        cursor = periodEnd;
        periodsSinceBreak++;

        // Add break after configured number of periods.
        if (
            periodsSinceBreak === config.breakAfterPeriods &&
            cursor + config.breakDurationMinutes < end
        ) {
            cursor += config.breakDurationMinutes;
            periodsSinceBreak = 0;
        }
    }

    return slots;
}


// --------------------------------------------------
// 4. GENERATE EXPLICITLY DEFINED PERIODS
// --------------------------------------------------

function generateExplicitPeriods(day, periods, nextId) {
    if (!Array.isArray(periods)) {
        throw new Error(`Periods for ${day} must be an array`);
    }

    const slots = [];

    for (const period of periods) {
        const startMinutes = timeToMinutes(period.start);
        const endMinutes = timeToMinutes(period.end);

        if (endMinutes <= startMinutes) {
            throw new Error(`Invalid period configuration for ${day}`);
        }

        slots.push({
            slotId: period.slotId ?? nextId.value++,
            day,
            start: period.start,
            end: period.end,
            startMinutes,
            endMinutes,
            durationMinutes: endMinutes - startMinutes,
            type: "CLASS"
        });
    }

    // Explicit periods must not overlap.
    const sorted = [...slots].sort(
        (a, b) => a.startMinutes - b.startMinutes
    );

    for (let i = 1; i < sorted.length; i++) {
        if (
            sorted[i].startMinutes <
            sorted[i - 1].endMinutes
        ) {
            throw new Error(`Overlapping periods configured for ${day}`);
        }
    }

    return slots;
}


// --------------------------------------------------
// 5. GENERATE ALL COLLEGE SLOTS
// --------------------------------------------------

function getCollegeSlots(overrides = {}) {
    const config = {
        ...DEFAULT_CONFIG,
        ...overrides,

        workingDays:
            overrides.workingDays === undefined
                ? DEFAULT_CONFIG.workingDays
                : overrides.workingDays,

        lunch:
            overrides.lunch === undefined
                ? DEFAULT_CONFIG.lunch
                : overrides.lunch,

        dayOverrides:
            overrides.dayOverrides === undefined
                ? DEFAULT_CONFIG.dayOverrides
                : overrides.dayOverrides,

        specialLabSlots:
            overrides.specialLabSlots === undefined
                ? DEFAULT_CONFIG.specialLabSlots
                : overrides.specialLabSlots
    };

    const validation = validateConfig(config);

    if (!validation.valid) {
        throw new Error(
            `Invalid college configuration: ${validation.errors.join("; ")}`
        );
    }

    const slots = [];
    let nextId = 1;

    for (const day of config.workingDays) {
        const setting = config.dayOverrides?.[day];

        let daySlots = [];

        // Option 1: Explicitly configured periods.
        if (setting && Array.isArray(setting.periods)) {
            const idCounter = { value: nextId };

            daySlots = generateExplicitPeriods(
                day,
                setting.periods,
                idCounter
            );

            nextId = Math.max(
                nextId,
                idCounter.value,
                ...daySlots.map(slot =>
                    typeof slot.slotId === "number"
                        ? slot.slotId + 1
                        : nextId
                )
            );
        } else {
            // Option 2: Automatically generate periods
            // from working hours and optional periodCount.
            const hours = setting || (
                day === "SAT"
                    ? config.saturdayWorkingHours
                    : config.defaultWorkingHours
            );

            if (!hours) {
                continue;
            }

            daySlots = generateDaySlots(
                day,
                hours,
                config,
                nextId
            );

            nextId += daySlots.length;
        }

        slots.push(...daySlots);
    }

    // Add special uninterrupted laboratory blocks.
    for (const special of config.specialLabSlots || []) {
        if (!config.workingDays.includes(special.day)) {
            throw new Error(
                `Special lab slot uses non-working day: ${special.day}`
            );
        }

        const startMinutes = timeToMinutes(special.start);
        const endMinutes = timeToMinutes(special.end);

        if (endMinutes <= startMinutes) {
            throw new Error(
                `Invalid special lab slot on ${special.day}`
            );
        }

        // A special lab block cannot cross lunch.
        if (
            config.lunch &&
            overlaps(
                startMinutes,
                endMinutes,
                timeToMinutes(config.lunch.start),
                timeToMinutes(config.lunch.end)
            )
        ) {
            throw new Error(
                `Special lab slot on ${special.day} crosses lunch`
            );
        }

        slots.push({
            ...special,

            slotId:
                special.slotId ??
                `SPECIAL-${special.day}-${special.start}`,

            startMinutes,
            endMinutes,

            durationMinutes:
                endMinutes - startMinutes,

            type: "SPECIAL_LAB"
        });
    }

    return slots;
}


// --------------------------------------------------
// 6. GET CONSECUTIVE LAB SLOT GROUPS
// --------------------------------------------------

function getConsecutiveSlotGroups(slots, requiredHours) {
    const requiredMinutes = Number(requiredHours) * 60;

    if (
        !Number.isFinite(requiredMinutes) ||
        requiredMinutes <= 0
    ) {
        return [];
    }

    const groups = [];

    // Special uninterrupted blocks.
    for (const slot of slots) {
        if (
            slot.type === "SPECIAL_LAB" &&
            slot.durationMinutes >= requiredMinutes
        ) {
            groups.push([slot]);
        }
    }

    // Group normal periods by day.
    const byDay = new Map();

    for (const slot of slots) {
        if (slot.type === "SPECIAL_LAB") {
            continue;
        }

        if (!byDay.has(slot.day)) {
            byDay.set(slot.day, []);
        }

        byDay.get(slot.day).push(slot);
    }

    for (const daySlots of byDay.values()) {
        daySlots.sort(
            (a, b) => a.startMinutes - b.startMinutes
        );

        for (let i = 0; i < daySlots.length; i++) {
            const group = [daySlots[i]];

            let totalMinutes =
                daySlots[i].durationMinutes;

            if (totalMinutes === requiredMinutes) {
                groups.push([...group]);
                continue;
            }

            for (
                let j = i + 1;
                j < daySlots.length;
                j++
            ) {
                const previous =
                    group[group.length - 1];

                const current = daySlots[j];

                // Do not cross breaks or gaps.
                if (
                    previous.endMinutes !==
                    current.startMinutes
                ) {
                    break;
                }

                group.push(current);
                totalMinutes += current.durationMinutes;

                if (totalMinutes === requiredMinutes) {
                    groups.push([...group]);
                    break;
                }

                if (totalMinutes > requiredMinutes) {
                    break;
                }
            }
        }
    }

    return groups;
}


// --------------------------------------------------
// 7. EXPORTS
// --------------------------------------------------

module.exports = {
    DAYS,
    DEFAULT_CONFIG,
    timeToMinutes,
    minutesToTime,
    overlaps,
    validateConfig,
    generateDaySlots,
    generateExplicitPeriods,
    getCollegeSlots,
    getConsecutiveSlotGroups
};
