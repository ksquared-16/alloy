/**
 * Alloy date value helpers — shared parse/suggest for the AlloyDateInput primitive.
 *
 * ── WHY THIS EXISTS ──
 *
 * The operational surfaces that ask an operator for a DATE were using a raw `<input type="date">`.
 * That control is the browser's, not Alloy's: it renders a different widget per platform, it puts
 * a system-blue calendar button next to canonical Alloy dropdowns, and on the one surface that
 * commits money it was the only thing on the card that did not look like the product.
 *
 * `AlloyTimeInput` had already settled the shape for the temporal case — a text field that accepts
 * what an operator types, a suggestion listbox, and a value module beside it holding parse and
 * format. This is that module's date sibling, and it deliberately changes nothing about meaning:
 *
 *   STORED VALUE  `YYYY-MM-DD` — byte-identical to what `<input type="date">` produced, so every
 *                 caller's payload, every resolver input and every column write is unchanged.
 *   DISPLAY       `formatDisplayDate`, the canonical presentation formatter, which already owns
 *                 the timezone rule. Nothing here formats a date itself.
 *
 * It is NOT a date picker and owns no calendar. Suggestions are the few relative days an operator
 * actually types on these surfaces; everything else is typed.
 */

/** A stored calendar date: `YYYY-MM-DD`, the native `<input type="date">` contract. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

/** Zero-padded `YYYY-MM-DD` from calendar parts. No Date object, so no UTC shift. */
function iso(year: number, month: number, day: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (year < 1900 || year > 2999) return null;
    /* Reject a day the month does not have — Feb 30 is a typo, not a date. */
    const lengths = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > lengths[month - 1]!) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Two-digit years the way operators mean them: 26 → 2026, 99 → 1999 is not a date they type. */
function fullYear(raw: string): number {
    const n = Number(raw);
    if (raw.length === 4) return n;
    return 2000 + n;
}

/** TODAY IN THE VIEWER'S OWN CALENDAR — local parts, never an ISO slice of a UTC instant. */
export function alloyDateToday(now: Date = new Date()): string {
    return iso(now.getFullYear(), now.getMonth() + 1, now.getDate()) ?? "";
}

/** `YYYY-MM-DD` `days` away from `from`, in local calendar days. */
export function alloyDateOffset(days: number, from: Date = new Date()): string {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()) ?? "";
}

/**
 * Parse operator input into a stored `YYYY-MM-DD`. Accepts:
 * `2026-09-30`, `9/30/2026`, `09/30/26`, `9-30-2026`, `9/30` (this year),
 * `Sep 30 2026`, `30 Sep 2026`, `today`, `tomorrow`, `yesterday`.
 *
 * Empty input returns `""` — clearing a date is an answer. Anything unparseable returns `null`,
 * and the control keeps the last good value rather than writing a guess into a money form.
 */
export function parseAlloyDateInput(raw: string, now: Date = new Date()): string | null {
    const text = raw.trim();
    if (!text) return "";

    const lower = text.toLowerCase();
    if (lower === "today") return alloyDateToday(now);
    if (lower === "tomorrow") return alloyDateOffset(1, now);
    if (lower === "yesterday") return alloyDateOffset(-1, now);

    const isoMatch = ISO_DATE.exec(text);
    if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

    /* M/D/Y and M-D-Y, with a two- or four-digit year. */
    const mdy = text.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/);
    if (mdy) {
        const year = mdy[3] ? fullYear(mdy[3]) : now.getFullYear();
        return iso(year, Number(mdy[1]), Number(mdy[2]));
    }

    /* `Sep 30 2026`, `September 30, 2026`, `Sep 30`. */
    const mdName = lower.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{2}|\d{4}))?$/);
    if (mdName) {
        const month = MONTHS.indexOf(mdName[1]!.slice(0, 3) as (typeof MONTHS)[number]) + 1;
        if (month > 0) {
            const year = mdName[3] ? fullYear(mdName[3]) : now.getFullYear();
            return iso(year, month, Number(mdName[2]));
        }
    }

    /* `30 Sep 2026`. */
    const dmName = lower.match(/^(\d{1,2})\s+([a-z]{3,9})\.?(?:,?\s*(\d{2}|\d{4}))?$/);
    if (dmName) {
        const month = MONTHS.indexOf(dmName[2]!.slice(0, 3) as (typeof MONTHS)[number]) + 1;
        if (month > 0) {
            const year = dmName[3] ? fullYear(dmName[3]) : now.getFullYear();
            return iso(year, month, Number(dmName[1]));
        }
    }

    return null;
}

/** The relative days operators actually reach for on these surfaces, as stored values. */
export function alloyDateSuggestions(now: Date = new Date()): ReadonlyArray<{ value: string; label: string }> {
    return [
        { value: alloyDateToday(now), label: "Today" },
        { value: alloyDateOffset(1, now), label: "Tomorrow" },
        { value: alloyDateOffset(-1, now), label: "Yesterday" },
        { value: alloyDateOffset(7, now), label: "In a week" },
    ];
}
