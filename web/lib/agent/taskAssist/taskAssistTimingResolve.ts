/** Deterministic natural-language send/reminder time parsing (no LLM). */

const WEEKDAY_INDEX: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function toDatetimeLocal(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseClockFromHint(h: string): { hour: number; minute: number } | null {
    const atMatch = h.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
    if (!atMatch) {
        const compact = h.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i) ?? h.match(/\bat\s+(\d{1,2})(a|p)\.?m?\.?\b/i);
        if (!compact) return null;
        let hour = Number(compact[1]);
        const apRaw = compact[2]?.toLowerCase() ?? "";
        const ap = apRaw.length === 1 ? `${apRaw}m` : apRaw;
        if (ap.startsWith("p") && hour < 12) hour += 12;
        if (ap.startsWith("a") && hour === 12) hour = 0;
        return { hour, minute: 0 };
    }
    let hour = Number(atMatch[1]);
    const minute = atMatch[2] ? Number(atMatch[2]) : 0;
    const ap = atMatch[3]?.toLowerCase();
    if (ap?.startsWith("p") && hour < 12) hour += 12;
    if (ap?.startsWith("a") && hour === 12) hour = 0;
    if (!ap && hour <= 7) hour += 12;
    return { hour, minute };
}

function weekdayIndexFromHint(h: string): number | null {
    for (const [token, idx] of Object.entries(WEEKDAY_INDEX)) {
        if (new RegExp(`\\b${token}\\b`, "i").test(h)) return idx;
    }
    return null;
}

function addDays(d: Date, days: number): Date {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
}

/** Next calendar occurrence of `weekday` (0=Sun) at optional clock; skips today if that time already passed. */
export function resolveNextWeekdayLocal(params: {
    weekday: number;
    hour: number;
    minute: number;
    now?: Date;
}): Date {
    const now = params.now ?? new Date();
    const target = new Date(now);
    const currentDow = target.getDay();
    let delta = (params.weekday - currentDow + 7) % 7;
    target.setHours(params.hour, params.minute, 0, 0);
    if (delta === 0 && target.getTime() <= now.getTime()) delta = 7;
    return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), params.hour, params.minute, 0, 0), delta);
}

export function timingHintHasExplicitClock(hint: string | null | undefined): boolean {
    if (!hint?.trim()) return false;
    return parseClockFromHint(hint.trim().toLowerCase()) != null;
}

export function timingHintIsDateGranularOnly(hint: string | null | undefined): boolean {
    if (!hint?.trim()) return false;
    const h = hint.trim().toLowerCase();
    if (timingHintHasExplicitClock(hint)) return false;
    if (weekdayIndexFromHint(h) != null) return !parseClockFromHint(h);
    return /\b(tomorrow|next\s+week)\b/i.test(h);
}

/**
 * Best-effort `datetime-local` from a timing hint (operator can edit).
 * Supports tomorrow, next week, weekdays ("Monday at 9a"), and clock phrases.
 */
export function timingHintToDatetimeLocal(
    hint: string | null | undefined,
    opts?: { now?: Date }
): string | null {
    if (!hint?.trim()) return null;
    const h = hint.trim().toLowerCase();
    const now = opts?.now ?? new Date();
    const clock = parseClockFromHint(h);
    const hour = clock?.hour ?? 9;
    const minute = clock?.minute ?? 0;
    const weekday = weekdayIndexFromHint(h);

    if (weekday != null) {
        return toDatetimeLocal(resolveNextWeekdayLocal({ weekday, hour, minute, now }));
    }

    const d = new Date(now);
    if (h.includes("tomorrow")) {
        d.setDate(d.getDate() + 1);
        d.setHours(hour, minute, 0, 0);
        return toDatetimeLocal(d);
    }
    if (h.includes("next week")) {
        d.setDate(d.getDate() + 7);
        d.setHours(hour, minute, 0, 0);
        return toDatetimeLocal(d);
    }
    if (h.includes("later") || h.includes("tonight") || h.includes("this evening")) {
        d.setHours(d.getHours() + 2);
        return toDatetimeLocal(d);
    }
    if (!clock) return null;

    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return toDatetimeLocal(d);
}

/** Human-readable schedule line for thread copy (local timezone). */
export function formatResolvedTimingLabel(hint: string | null | undefined, opts?: { now?: Date }): string | null {
    const local = timingHintToDatetimeLocal(hint, opts);
    if (!local) return hint?.trim() || null;
    const t = Date.parse(local);
    if (Number.isNaN(t)) return hint?.trim() || null;
    return new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
