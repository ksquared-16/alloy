/**
 * Compact schedule projection for identity cards — same Schedule card VM, fewer lines.
 *
 * Consumes the canonical `ChildScheduling` read model attached at first paint
 * (`context.truth._scheduling_projection.byMemberId`) so Children roster fields
 * match Scheduling card room / days / site / effective / status semantics.
 */

import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type {
    ChildScheduling,
    ChildSchedulingStatus,
    ScheduleView,
} from "@/lib/scheduling/projection/schedulingProjectionTypes";

export type CompactScheduleIdentityProjection = {
    scheduleLabel: string | null;
    roomLabel: string | null;
    siteLabel: string | null;
    daysLabel: string | null;
    hoursLabel: string | null;
    effectiveLabel: string | null;
    statusLabel: string | null;
    compactLine: string | null;
};

const STATUS_LABELS: Record<ChildSchedulingStatus, string> = {
    scheduled: "Active",
    proposed: "Proposed",
    "needs-placement": "Needs a room",
    "upcoming-only": "Future",
    ended: "Ended",
};

function existingScheduleView(scheduling: ChildScheduling): ScheduleView | null {
    return scheduling.current ?? scheduling.proposed ?? null;
}

function formatIsoDate(iso: string | null | undefined): string | null {
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

function formatHours(arrive: string | null, depart: string | null): string | null {
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

export function projectCompactScheduleForIdentity(
    scheduling: ChildScheduling | null | undefined,
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
    };
    if (!scheduling) return empty;

    const statusLabel = STATUS_LABELS[scheduling.status] ?? scheduling.status;
    const siteLabel = scheduling.child.siteName?.trim() || null;
    const view = existingScheduleView(scheduling);
    if (!view) {
        return {
            ...empty,
            siteLabel,
            statusLabel,
            scheduleLabel: statusLabel,
            compactLine: [siteLabel, statusLabel].filter(Boolean).join(" · ") || statusLabel,
        };
    }

    const assignment = view.assignments[0] ?? null;
    const roomLabel = assignment?.room.name?.trim() || null;
    const daysLabel = assignment?.weekdays?.length ? formatWeekdays(assignment.weekdays) : null;
    const hoursLabel = assignment
        ? formatHours(assignment.arriveTime, assignment.departTime)
        : null;
    const scheduleTypeLabel = view.scheduleTypeLabel?.trim() || view.scheduleType?.trim() || null;
    const effectiveLabel = view.effectiveFrom
        ? `from ${formatIsoDate(view.effectiveFrom)}${view.openEnded ? " · open-ended" : ""}`
        : null;

    const parts = [
        daysLabel,
        hoursLabel,
        siteLabel,
        roomLabel,
        scheduleTypeLabel,
        effectiveLabel,
        statusLabel,
    ].filter(Boolean) as string[];

    const compactLine = parts.length > 0 ? parts.join(" · ") : null;

    return {
        scheduleLabel: compactLine ?? scheduleTypeLabel ?? statusLabel,
        roomLabel,
        siteLabel,
        daysLabel,
        hoursLabel,
        effectiveLabel,
        statusLabel,
        compactLine,
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
