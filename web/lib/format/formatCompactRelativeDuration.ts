/**
 * Shared compact relative-duration labels for operator surfaces.
 *
 * Output vocabulary (no "ago", no ambiguous month `m`):
 *   <1m | 12m | 3h | 2d | 4w | 3mo
 *
 * Calendar week/month thresholds use fixed UTC day counts (7 / ~30.44) so this stays
 * feature-agnostic. Callers that need org-local calendar boundaries should pass a
 * pre-normalized `nowMs` / `fromMs` pair.
 */

export type CompactRelativeDuration = {
    /** Compact label for dense UI (`12m`, `3h`, `2d`, `4w`, `3mo`, `<1m`). */
    compact: string;
    /** Accessible / tooltip sentence fragment (`2 days`, `3 months`). */
    accessibleUnit: string;
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
/** Average Gregorian month length — avoids ambiguous `m` for months. */
const MS_PER_MONTH = 30.4375 * MS_PER_DAY;

function plural(n: number, unit: string): string {
    return n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
}

/**
 * Format elapsed duration from `fromMs` to `nowMs` as compact relative time.
 * Returns null when either timestamp is invalid or `fromMs` is in the future beyond skew.
 */
export function formatCompactRelativeDuration(
    fromMs: number,
    nowMs: number = Date.now(),
): CompactRelativeDuration | null {
    if (!Number.isFinite(fromMs) || !Number.isFinite(nowMs)) return null;
    const diffMs = nowMs - fromMs;
    if (diffMs < 0) {
        // Small clock skew: treat as just entered.
        if (diffMs > -MS_PER_MINUTE) {
            return { compact: "<1m", accessibleUnit: "less than 1 minute" };
        }
        return null;
    }

    if (diffMs < MS_PER_MINUTE) {
        return { compact: "<1m", accessibleUnit: "less than 1 minute" };
    }

    const minutes = Math.floor(diffMs / MS_PER_MINUTE);
    if (minutes < 60) {
        return { compact: `${minutes}m`, accessibleUnit: plural(minutes, "minute") };
    }

    const hours = Math.floor(diffMs / MS_PER_HOUR);
    if (hours < 24) {
        return { compact: `${hours}h`, accessibleUnit: plural(hours, "hour") };
    }

    const days = Math.floor(diffMs / MS_PER_DAY);
    if (days < 7) {
        return { compact: `${days}d`, accessibleUnit: plural(days, "day") };
    }

    const weeks = Math.floor(diffMs / MS_PER_WEEK);
    if (diffMs < MS_PER_MONTH) {
        return { compact: `${weeks}w`, accessibleUnit: plural(weeks, "week") };
    }

    const months = Math.max(1, Math.floor(diffMs / MS_PER_MONTH));
    return { compact: `${months}mo`, accessibleUnit: plural(months, "month") };
}

/** Parse ISO and format; null when evidence is missing or invalid. */
export function formatCompactRelativeDurationIso(
    fromIso: string | null | undefined,
    nowMs: number = Date.now(),
): CompactRelativeDuration | null {
    const raw = typeof fromIso === "string" ? fromIso.trim() : "";
    if (!raw) return null;
    const fromMs = Date.parse(raw);
    if (!Number.isFinite(fromMs)) return null;
    return formatCompactRelativeDuration(fromMs, nowMs);
}

/** Full accessible label for operational stage age. */
export function formatOperationalAgeAccessibleLabel(
    fromIso: string | null | undefined,
    nowMs: number = Date.now(),
): string | null {
    const formatted = formatCompactRelativeDurationIso(fromIso, nowMs);
    if (!formatted) return null;
    return `In this stage for ${formatted.accessibleUnit}`;
}
