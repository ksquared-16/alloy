/**
 * Location Program availability presentation — effective dates + local display name.
 *
 * Canonical semantics (null dates do NOT mean not offered):
 * - no relationship → not_offered
 * - relationship + is_active false / archived → not_offered (removed)
 * - relationship + future available_from → scheduled
 * - relationship + past available_through → ended
 * - otherwise → active (offered now)
 */

export type LocationProgramAvailabilityStatus = "scheduled" | "active" | "ended" | "not_offered";

/** Alias used by Locations offering checklist / cross-surface agreement. */
export type LocationProgramOfferingState = LocationProgramAvailabilityStatus;

export type LocationProgramAvailabilityView = {
    locationId: string;
    locationLabel: string;
    organizationProgramName: string;
    localDisplayName: string | null;
    effectiveLabel: string;
    availableFrom: string | null;
    availableThrough: string | null;
    offered: boolean;
    status: LocationProgramAvailabilityStatus;
    statusLabel: string;
    secondaryLine: string | null;
};

function parseDateOnly(value: string | null | undefined): string | null {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return null;
    // Accept YYYY-MM-DD or ISO timestamps — compare on calendar date in UTC.
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? null;
}

export function todayYmd(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

/**
 * Precedence:
 * 1. no relationship / inactive → not_offered
 * 2. future available_from → scheduled
 * 3. expired available_through → ended
 * 4. otherwise → active
 *
 * Null available_from + null available_through = currently offered (active).
 */
export function deriveLocationProgramAvailabilityStatus(input: {
    offered: boolean;
    availableFrom: string | null | undefined;
    availableThrough: string | null | undefined;
    asOfYmd?: string;
}): LocationProgramAvailabilityStatus {
    if (!input.offered) return "not_offered";
    const asOf = input.asOfYmd ?? todayYmd();
    const from = parseDateOnly(input.availableFrom);
    const through = parseDateOnly(input.availableThrough);
    if (from && from > asOf) return "scheduled";
    if (through && through < asOf) return "ended";
    return "active";
}

/** Canonical resolver for Location Program Offering checklist + counts agreement. */
export function deriveLocationProgramOfferingState(input: {
    relationship:
        | { is_active?: boolean | null; available_from?: string | null; available_through?: string | null }
        | null
        | undefined;
    asOfYmd?: string;
}): LocationProgramOfferingState {
    if (!input.relationship) return "not_offered";
    const offered = input.relationship.is_active !== false;
    return deriveLocationProgramAvailabilityStatus({
        offered,
        availableFrom: input.relationship.available_from,
        availableThrough: input.relationship.available_through,
        asOfYmd: input.asOfYmd,
    });
}

/** Checkbox selected when a relationship exists and is not removed (includes scheduled + ended). */
export function locationProgramOfferingCheckboxSelected(state: LocationProgramOfferingState): boolean {
    return state === "active" || state === "scheduled" || state === "ended";
}

function formatShortDate(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function locationProgramAvailabilityStatusLabel(
    status: LocationProgramAvailabilityStatus,
    availableFrom: string | null,
    availableThrough: string | null,
): string {
    if (status === "not_offered") return "Not offered";
    if (status === "scheduled") {
        const from = parseDateOnly(availableFrom);
        return from ? `Begins ${formatShortDate(from)}` : "Scheduled";
    }
    if (status === "ended") {
        const through = parseDateOnly(availableThrough);
        return through ? `Ended ${formatShortDate(through)}` : "Ended";
    }
    const through = parseDateOnly(availableThrough);
    if (through) return `Through ${formatShortDate(through)}`;
    return "Available now";
}

export function buildLocationProgramAvailabilityView(input: {
    locationId: string;
    locationLabel: string;
    organizationProgramName: string;
    localDisplayName: string | null;
    availableFrom: string | null;
    availableThrough: string | null;
    offered: boolean;
    asOfYmd?: string;
}): LocationProgramAvailabilityView {
    const local = input.localDisplayName?.trim() || null;
    const orgName = input.organizationProgramName.trim() || "Program";
    const status = deriveLocationProgramAvailabilityStatus(input);
    const effectiveLabel = local || orgName;
    const secondary =
        local && local !== orgName ? `Shown locally as “${local}”` : null;
    return {
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        organizationProgramName: orgName,
        localDisplayName: local,
        effectiveLabel,
        availableFrom: parseDateOnly(input.availableFrom),
        availableThrough: parseDateOnly(input.availableThrough),
        offered: input.offered,
        status,
        statusLabel: locationProgramAvailabilityStatusLabel(
            status,
            input.availableFrom,
            input.availableThrough,
        ),
        secondaryLine: secondary,
    };
}

export function formatProgramCollectionAvailabilitySummary(input: {
    activeCount: number;
    scheduledCount: number;
    earliestScheduledFrom: string | null;
}): string {
    const { activeCount, scheduledCount, earliestScheduledFrom } = input;
    if (activeCount <= 0 && scheduledCount <= 0) return "Not available at any Locations";
    if (activeCount <= 0 && scheduledCount > 0) {
        const from = parseDateOnly(earliestScheduledFrom);
        return from ? `Available beginning ${formatShortDate(from)}` : "Scheduled at Locations";
    }
    if (activeCount === 1 && scheduledCount === 0) return "Available at 1 Location";
    if (scheduledCount === 0) return `Available at ${activeCount} Locations`;
    if (activeCount === 1) return `Available at 1 Location · ${scheduledCount} scheduled`;
    return `Available at ${activeCount} Locations · ${scheduledCount} scheduled`;
}

export function earliestFutureAvailabilityDate(
    dates: readonly (string | null | undefined)[],
    asOfYmd = todayYmd(),
): string | null {
    let earliest: string | null = null;
    for (const raw of dates) {
        const ymd = parseDateOnly(raw);
        if (!ymd || ymd <= asOfYmd) continue;
        if (!earliest || ymd < earliest) earliest = ymd;
    }
    return earliest;
}
