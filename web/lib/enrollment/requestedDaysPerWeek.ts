/**
 * Requested days per week — validation for participation draft.
 * Bounds: 1–7 inclusive; empty/null clears. Does not fabricate a schedule.
 */

export const REQUESTED_DAYS_PER_WEEK_MIN = 1;
export const REQUESTED_DAYS_PER_WEEK_MAX = 7;

export type RequestedDaysParseResult =
    | { ok: true; value: number | null }
    | { ok: false; error: string };

export function parseRequestedDaysPerWeekInput(raw: unknown): RequestedDaysParseResult {
    if (raw == null || raw === "") return { ok: true, value: null };
    if (typeof raw === "number") {
        if (!Number.isFinite(raw)) return { ok: false, error: "Enter a whole number of days per week." };
        const n = Math.floor(raw);
        if (n < REQUESTED_DAYS_PER_WEEK_MIN || n > REQUESTED_DAYS_PER_WEEK_MAX) {
            return {
                ok: false,
                error: `Requested days must be between ${REQUESTED_DAYS_PER_WEEK_MIN} and ${REQUESTED_DAYS_PER_WEEK_MAX}.`,
            };
        }
        return { ok: true, value: n };
    }
    const text = String(raw).trim();
    if (!text) return { ok: true, value: null };
    if (!/^\d+$/.test(text)) {
        return { ok: false, error: "Enter a whole number of days per week." };
    }
    const n = Number(text);
    if (n < REQUESTED_DAYS_PER_WEEK_MIN || n > REQUESTED_DAYS_PER_WEEK_MAX) {
        return {
            ok: false,
            error: `Requested days must be between ${REQUESTED_DAYS_PER_WEEK_MIN} and ${REQUESTED_DAYS_PER_WEEK_MAX}.`,
        };
    }
    return { ok: true, value: n };
}
