/** Max span for public tour slot queries (abuse guard). */
export const TOUR_PUBLIC_SLOTS_MAX_RANGE_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Validates `from`/`to` for public slot listing. Returns clamped upper bound or an error message.
 */
export function assertTourPublicSlotsQueryWindow(from: Date, to: Date): { ok: true; from: Date; to: Date } | { ok: false; message: string } {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(to > from)) {
        return { ok: false, message: "Invalid from/to range" };
    }
    const span = to.getTime() - from.getTime();
    if (span > TOUR_PUBLIC_SLOTS_MAX_RANGE_MS) {
        return { ok: false, message: `Date range too large (max ${TOUR_PUBLIC_SLOTS_MAX_RANGE_MS / (24 * 60 * 60 * 1000)} days)` };
    }
    return { ok: true, from, to };
}
