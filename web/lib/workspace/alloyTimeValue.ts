/**
 * Alloy time value helpers — shared parse/format for the AlloyTimeInput primitive.
 *
 * Stored value matches native `<input type="time">`: `HH:mm` (24-hour, no seconds).
 * Display is a calm operator string such as `8:30 AM`.
 */

const TIME_HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Format a stored `HH:mm` value for display (e.g. `08:30` → `8:30 AM`). Empty → "". */
export function formatAlloyTimeDisplay(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const m = TIME_HH_MM.exec(trimmed);
    if (!m) return trimmed;
    let hour = Number(m[1]);
    const minute = m[2];
    const period = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${period}`;
}

/**
 * Parse operator input into stored `HH:mm`. Accepts:
 * `8:30 AM`, `8:30am`, `0830a`, `14:30`, `2:30 PM`, partial digits.
 * Returns null when unparseable.
 */
export function parseAlloyTimeInput(raw: string): string | null {
    const text = raw.trim();
    if (!text) return "";

    const compact = text.replace(/\s+/g, " ").trim();

    // 24h HH:mm
    const h24 = TIME_HH_MM.exec(compact);
    if (h24) {
        return `${h24[1]!.padStart(2, "0")}:${h24[2]}`;
    }

    // 12h with optional colon and AM/PM
    const ampm = compact.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?$/);
    if (ampm) {
        let hour = Number(ampm[1]);
        const minute = ampm[2] ?? "00";
        if (hour < 1 || hour > 12 || Number(minute) > 59) return null;
        const isPm = ampm[3]!.toLowerCase() === "p";
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
        return `${String(hour).padStart(2, "0")}:${minute}`;
    }

    // Digits only: HHmm / HMM / HHMM with trailing a/p
    const digitsAmPm = compact.match(/^(\d{3,4})\s*([AaPp])\.?[Mm]?\.?$/);
    if (digitsAmPm) {
        const digits = digitsAmPm[1]!;
        const minute = digits.slice(-2);
        let hour = Number(digits.slice(0, -2));
        if (hour < 1 || hour > 12 || Number(minute) > 59) return null;
        const isPm = digitsAmPm[2]!.toLowerCase() === "p";
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
        return `${String(hour).padStart(2, "0")}:${minute}`;
    }

    // Digits only as 24h HHmm
    const digits24 = compact.match(/^(\d{3,4})$/);
    if (digits24) {
        const digits = digits24[1]!;
        const minute = digits.slice(-2);
        const hour = Number(digits.slice(0, -2));
        if (hour > 23 || Number(minute) > 59) return null;
        return `${String(hour).padStart(2, "0")}:${minute}`;
    }

    return null;
}

/** Common daycare / ops suggestion times (stored `HH:mm`). */
export const ALLOY_TIME_SUGGESTIONS: readonly string[] = [
    "07:00",
    "07:30",
    "08:00",
    "08:30",
    "09:00",
    "09:30",
    "10:00",
    "11:00",
    "12:00",
    "12:30",
    "13:00",
    "14:00",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
];
