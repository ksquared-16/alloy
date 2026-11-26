/**
 * Canonical Assignment summary — shared by Scheduling card rows and
 * Children-card Schedule fields.
 *
 * Default scan line: Room · Days · Effective · Time
 * Examples:
 *   Pre-K · Mon–Fri · Aug 24, 2026 · 8:30 AM–4:00 PM
 *   Toddler East · Tue/Thu · Sep 1 → Dec 15 · 9:00 AM–2:00 PM
 *
 * Never appends “open-ended.” Null effective end omits the end segment entirely.
 * Site / schedule type / status remain optional (off by default).
 * Hours are included by default for operational scanning (`includeHours: false` to omit).
 */

import type {
    ChildScheduling,
    ChildSchedulingStatus,
    ScheduleView,
} from "@/lib/scheduling/projection/schedulingProjectionTypes";

export type CompactScheduleIdentityProjection = {
    /** Default compact summary (Room · Days · Effective · Time). */
    scheduleLabel: string | null;
    roomLabel: string | null;
    siteLabel: string | null;
    daysLabel: string | null;
    hoursLabel: string | null;
    /** Effective segment only — never includes “open-ended.” */
    effectiveLabel: string | null;
    statusLabel: string | null;
    /** Alias of scheduleLabel (default compact). */
    compactLine: string | null;
    /** Primary assignment type label when present. */
    primaryTypeLabel: string | null;
    /** Count of concurrent current/proposed assignments. */
    assignmentCount: number;
};

export type CompactScheduleProjectionOptions = {
    /** Include time segment (default true for operational scanning). */
    includeHours?: boolean;
    includeSite?: boolean;
    includeScheduleType?: boolean;
    includeStatus?: boolean;
    /** When no schedule view exists, emit this instead of null (Scheduling roster). */
    emptyLabel?: string | null;
};

const STATUS_LABELS: Record<ChildSchedulingStatus, string> = {
    scheduled: "Active",
    proposed: "Proposed",
    "needs-placement": "Needs a room",
    "upcoming-only": "Future",
    ended: "Ended",
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function existingScheduleView(scheduling: ChildScheduling): ScheduleView | null {
    return scheduling.current ?? scheduling.proposed ?? null;
}

export function formatCompactScheduleIsoDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
}

/** Mon–Fri contiguous → "Mon–Fri"; otherwise short weekday list with "/". */
export function formatCompactScheduleWeekdays(weekdays: readonly number[]): string | null {
    if (!weekdays.length) return null;
    const sorted = [...weekdays].sort((a, b) => a - b);
    if (sorted.join(",") === "1,2,3,4,5") return "Mon–Fri";
    return sorted.map((d) => WEEKDAY_NAMES[d] ?? String(d)).join("/");
}

export function formatCompactScheduleHours(
    arrive: string | null | undefined,
    depart: string | null | undefined,
): string | null {
    if (!arrive && !depart) return null;
    const fmt = (raw: string) => {
        const [hh, mm] = raw.split(":").map(Number);
        if (Number.isNaN(hh)) return raw;
        const ap = hh < 12 ? "AM" : "PM";
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
    };
    if (arrive && depart) return `${fmt(arrive)}–${fmt(depart)}`;
    return arrive ? fmt(arrive) : depart ? fmt(depart) : null;
}

/**
 * Effective date segment for compact summaries.
 * - open-ended / null end → "{start}" (never "open-ended" / never "from")
 * - both ends → "{start} → {end}"
 */
export function formatCompactScheduleEffective(args: {
    effectiveFrom: string | null | undefined;
    effectiveTo?: string | null | undefined;
    openEnded?: boolean;
}): string | null {
    const from = formatCompactScheduleIsoDate(args.effectiveFrom);
    if (!from) return null;
    const toRaw = args.effectiveTo?.trim() || null;
    if (!toRaw || args.openEnded) {
        return from;
    }
    const to = formatCompactScheduleIsoDate(toRaw);
    if (!to) return from;
    return `${from} → ${to}`;
}

function joinCompactParts(parts: Array<string | null | undefined>): string | null {
    const filtered = parts.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
    return filtered.length > 0 ? filtered.join(" · ") : null;
}

export function projectCompactScheduleForIdentity(
    scheduling: ChildScheduling | null | undefined,
    options: CompactScheduleProjectionOptions = {},
): CompactScheduleIdentityProjection {
    const empty: CompactScheduleIdentityProjection = {
        scheduleLabel: null,
        roomLabel: null,
        siteLabel: null,
        daysLabel: null,
        hoursLabel: null,
        effectiveLabel: null,
        statusLabel: null,
        compactLine: null,
        primaryTypeLabel: null,
        assignmentCount: 0,
    };
    if (!scheduling) {
        const emptyLabel = options.emptyLabel ?? null;
        return emptyLabel
            ? { ...empty, scheduleLabel: emptyLabel, compactLine: emptyLabel }
            : empty;
    }

    const statusLabel = STATUS_LABELS[scheduling.status] ?? scheduling.status;
    const siteLabel = scheduling.child.siteName?.trim() || null;
    const view = existingScheduleView(scheduling);
    if (!view) {
        const emptyLabel = options.emptyLabel ?? null;
        const fallback = emptyLabel ?? null;
        return {
            ...empty,
            siteLabel,
            statusLabel,
            scheduleLabel: fallback,
            compactLine: fallback,
        };
    }

    const assignments = view.assignments ?? [];
    const primary =
        assignments.find((a) => a.isPrimary) ?? assignments[0] ?? null;
    const assignment = primary;
    const roomLabel = assignment?.room.name?.trim() || null;
    const primaryTypeLabel = assignment?.assignmentType?.label?.trim() || null;
    const daysLabel = assignment?.weekdays?.length
        ? formatCompactScheduleWeekdays(assignment.weekdays)
        : null;
    const hoursLabel = assignment
        ? formatCompactScheduleHours(assignment.arriveTime, assignment.departTime)
        : null;
    const scheduleTypeLabel = view.scheduleTypeLabel?.trim() || view.scheduleType?.trim() || null;
    const effectiveLabel = formatCompactScheduleEffective({
        effectiveFrom: view.effectiveFrom,
        effectiveTo: view.effectiveTo,
        openEnded: view.openEnded,
    });
    const moreCount = Math.max(0, assignments.length - 1);
    const moreLabel = moreCount > 0 ? `+${moreCount} more` : null;
    const includeHours = options.includeHours !== false;

    // Default scan: Room · Days · Effective · Time · +N more
    const defaultParts: Array<string | null> = [
        roomLabel,
        daysLabel,
        effectiveLabel,
    ];
    if (includeHours) defaultParts.push(hoursLabel);
    defaultParts.push(moreLabel);
    if (options.includeSite) defaultParts.push(siteLabel);
    if (options.includeScheduleType) defaultParts.push(scheduleTypeLabel);
    if (options.includeStatus) defaultParts.push(statusLabel);

    const compactLine = joinCompactParts(defaultParts);

    return {
        scheduleLabel: compactLine,
        roomLabel,
        siteLabel,
        daysLabel,
        hoursLabel,
        effectiveLabel,
        statusLabel,
        compactLine,
        primaryTypeLabel,
        assignmentCount: assignments.length,
    };
}

/** Read `byMemberId` index from operational truth. Pure. */
export function readSchedulingProjectionByMemberId(
    truth: Record<string, unknown>,
): Record<string, ChildScheduling> {
    const bag = truth._scheduling_projection;
    if (!bag || typeof bag !== "object") return {};
    const byMemberId = (bag as { byMemberId?: unknown }).byMemberId;
    if (!byMemberId || typeof byMemberId !== "object") return {};
    return byMemberId as Record<string, ChildScheduling>;
}
