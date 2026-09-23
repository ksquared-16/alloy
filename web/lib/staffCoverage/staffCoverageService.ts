/**
 * COVERAGE — the canonical read and write path.
 *
 * Coverage answers where a Staff member is PLANNED to work on a specific day when
 * that differs from, or specializes, their durable Assignment. It never rewrites the
 * Assignment, and it is not Availability (when they can work) or Presence (what
 * happened).
 *
 * ── EVERY MUTATION GOES THROUGH A DATABASE FUNCTION, DELIBERATELY ──
 *
 * A revision retires one allocation and writes its replacement. supabase-js has no
 * multi-statement transaction, so doing that here would leave a window in which the
 * predecessor is retired and the replacement failed — an operator shown success over
 * a day with no plan at all. The RPCs make each intent atomic, and they also order
 * the statements so the active-only overlap exclusion permits a replacement that
 * overlaps what it replaces.
 *
 * ── ONE DEFINITION OF "EFFECTIVE" ──
 *
 * Employment-first and place-first are different questions over the same fact. Both
 * resolve through the same database functions rather than re-deriving lifecycle here,
 * because two interpretations of "effective" is the failure this shape invites.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CoverageLifecycleState = "active" | "superseded" | "cancelled";
export type CoverageTransition = "revision" | "correction";

export type CoverageAllocation = {
    id: string;
    orgId: string;
    employmentId: string;
    serviceDate: string;
    /** HH:MM, half-open: [startTime, endTime). */
    startTime: string;
    endTime: string;
    siteLocationId: string;
    /** Null is legitimate site-level Coverage, never a placeholder room. */
    roomLocationId: string | null;
    lifecycleState: CoverageLifecycleState;
    transitionType: CoverageTransition | null;
    supersedesCoverageId: string | null;
    lineageRootId: string | null;
    /** Why this allocation was authored. A later cancellation never rewrites it. */
    reasonKey: string | null;
    /** Why it was cancelled. Null unless lifecycleState is "cancelled". */
    cancelReasonKey: string | null;
    note: string | null;
    sourceKey: string;
    createdBy: string | null;
    createdAt: string;
    cancelledBy: string | null;
    cancelledAt: string | null;
};

type Row = Record<string, unknown>;

function hhmm(v: unknown): string {
    const s = String(v ?? "");
    return s.length >= 5 ? s.slice(0, 5) : s;
}

function mapRow(r: Row): CoverageAllocation {
    return {
        id: String(r.id),
        orgId: String(r.org_id),
        employmentId: String(r.employment_id),
        serviceDate: String(r.service_date),
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        siteLocationId: String(r.site_location_id),
        roomLocationId: (r.room_location_id as string | null) ?? null,
        lifecycleState: r.lifecycle_state as CoverageLifecycleState,
        transitionType: (r.transition_type as CoverageTransition | null) ?? null,
        supersedesCoverageId: (r.supersedes_coverage_id as string | null) ?? null,
        lineageRootId: (r.lineage_root_id as string | null) ?? null,
        reasonKey: (r.reason_key as string | null) ?? null,
        cancelReasonKey: (r.cancel_reason_key as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        sourceKey: String(r.source_key ?? "operator"),
        createdBy: (r.created_by as string | null) ?? null,
        createdAt: String(r.created_at),
        cancelledBy: (r.cancelled_by as string | null) ?? null,
        cancelledAt: (r.cancelled_at as string | null) ?? null,
    };
}

/**
 * Storage enforcement translated into something an operator can act on.
 *
 * A raw exclusion-constraint message names an int4range of minutes and a constraint
 * nobody outside this file has heard of. The conflict it describes — this person is
 * already planned somewhere else then — is the whole point, so it is worth saying.
 */
export class CoverageConflictError extends Error {
    readonly code = "coverage_conflict";
    constructor(message: string) {
        super(message);
        this.name = "CoverageConflictError";
    }
}

export class CoverageRejectedError extends Error {
    readonly code = "coverage_rejected";
    constructor(message: string) {
        super(message);
        this.name = "CoverageRejectedError";
    }
}

function translate(message: string): never {
    const m = message.toLowerCase();
    if (m.includes("staff_coverage_allocations_no_overlap") || m.includes("exclusion constraint")) {
        throw new CoverageConflictError(
            "This person is already planned somewhere else during part of that time. Change or cancel the existing Coverage first."
        );
    }
    if (m.includes("site-level coverage uses a null room")) {
        throw new CoverageRejectedError("Site-level Coverage leaves the room empty rather than naming the site.");
    }
    if (m.includes("does not belong to site")) {
        throw new CoverageRejectedError("That room is not part of the selected site.");
    }
    if (m.includes("outside employment")) {
        throw new CoverageRejectedError("That date is outside this person's employment.");
    }
    if (m.includes("staff_coverage_allocations_time_order")) {
        throw new CoverageRejectedError("Coverage must end after it starts, and cannot run overnight.");
    }
    throw new CoverageRejectedError(message);
}

export type PlanCoverageInput = {
    orgId: string;
    employmentId: string;
    serviceDate: string;
    startTime: string;
    endTime: string;
    siteLocationId: string;
    roomLocationId?: string | null;
    reasonKey?: string | null;
    note?: string | null;
    sourceKey?: string;
    actorUserId?: string | null;
};

export async function planCoverage(supabase: SupabaseClient, input: PlanCoverageInput): Promise<string> {
    const { data, error } = await supabase.rpc("staff_coverage_plan", {
        p_org_id: input.orgId,
        p_employment_id: input.employmentId,
        p_service_date: input.serviceDate,
        p_start_time: input.startTime,
        p_end_time: input.endTime,
        p_site_location_id: input.siteLocationId,
        p_room_location_id: input.roomLocationId ?? null,
        p_reason_key: input.reasonKey ?? null,
        p_note: input.note ?? null,
        p_source_key: input.sourceKey ?? "operator",
        p_actor: input.actorUserId ?? null,
    });
    if (error) translate(error.message);
    return String(data);
}

export type SupersedeCoverageInput = {
    coverageId: string;
    transition: CoverageTransition;
    serviceDate?: string;
    startTime?: string;
    endTime?: string;
    siteLocationId?: string;
    /**
     * Passing `roomLocationId` (including null) MOVES the allocation. Omitting the key
     * leaves it alone — the distinction matters because null is a real destination
     * (site-level), not an absence of intent.
     */
    roomLocationId?: string | null;
    reasonKey?: string | null;
    note?: string | null;
    actorUserId?: string | null;
};

export async function supersedeCoverage(
    supabase: SupabaseClient,
    input: SupersedeCoverageInput
): Promise<string> {
    const roomExplicit = Object.prototype.hasOwnProperty.call(input, "roomLocationId");
    const { data, error } = await supabase.rpc("staff_coverage_supersede", {
        p_coverage_id: input.coverageId,
        p_transition: input.transition,
        p_service_date: input.serviceDate ?? null,
        p_start_time: input.startTime ?? null,
        p_end_time: input.endTime ?? null,
        p_site_location_id: input.siteLocationId ?? null,
        p_room_location_id: input.roomLocationId ?? null,
        p_room_explicit: roomExplicit,
        p_reason_key: input.reasonKey ?? null,
        p_note: input.note ?? null,
        p_actor: input.actorUserId ?? null,
    });
    if (error) translate(error.message);
    return String(data);
}

export async function cancelCoverage(
    supabase: SupabaseClient,
    coverageId: string,
    reasonKey?: string | null,
    actorUserId?: string | null
): Promise<void> {
    const { error } = await supabase.rpc("staff_coverage_cancel", {
        p_coverage_id: coverageId,
        p_reason_key: reasonKey ?? null,
        p_actor: actorUserId ?? null,
    });
    if (error) translate(error.message);
}

/** Employment-first: what is this person planned to do over this window? */
export async function effectiveCoverageForEmployment(
    supabase: SupabaseClient,
    input: { orgId: string; employmentId: string; dateFrom: string; dateTo: string }
): Promise<CoverageAllocation[]> {
    const { data, error } = await supabase.rpc("staff_coverage_effective_for_employment", {
        p_org_id: input.orgId,
        p_employment_id: input.employmentId,
        p_date_from: input.dateFrom,
        p_date_to: input.dateTo,
    });
    if (error) throw new Error(`effectiveCoverageForEmployment: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapRow);
}

/** Place-first: who is planned HERE? The question a coverage surface actually asks. */
export async function effectiveCoverageForSite(
    supabase: SupabaseClient,
    input: { orgId: string; siteLocationId: string; dateFrom: string; dateTo: string; roomLocationId?: string | null }
): Promise<CoverageAllocation[]> {
    const { data, error } = await supabase.rpc("staff_coverage_effective_for_site", {
        p_org_id: input.orgId,
        p_site_location_id: input.siteLocationId,
        p_date_from: input.dateFrom,
        p_date_to: input.dateTo,
        p_room_location_id: input.roomLocationId ?? null,
    });
    if (error) throw new Error(`effectiveCoverageForSite: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapRow);
}
