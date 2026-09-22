/**
 * Coverage audit — five distinguishable lifecycle operations, derived from lineage.
 *
 * There is deliberately no second Coverage event table. The allocation rows already
 * carry every fact an audit needs — who, when, which predecessor, which transition,
 * why — and a parallel log would be a second place to ask what happened, free to
 * drift from the first. Coverage spent Phase 1 earning ONE authority; spending
 * Phase 7 creating a rival would undo that.
 *
 * So this is a projection. It reads the lineage and names what an operator did:
 *
 *   CREATED     an allocation with no predecessor
 *   REVISED     a replacement whose transition is a genuine change of plan
 *   CORRECTED   a replacement whose transition is fixing a mistaken record
 *   SUPERSEDED  the predecessor, at the moment its replacement was written
 *   CANCELLED   an allocation withdrawn with no replacement
 *
 * REVISED/CORRECTED and SUPERSEDED are two halves of one operator intent, and both
 * are emitted: the first says what is now true, the second says what stopped being
 * true. An audit that showed only the replacement would leave the retired plan
 * looking like it simply vanished.
 *
 * ── ONE TIMESTAMP THAT IS NOT ON ITS OWN ROW ──
 *
 * A superseded row does not record when it was retired; the schema has no column
 * for it, because the retirement and the replacement happen in the same
 * transaction. SUPERSEDED therefore borrows the successor's `created_at` and
 * actor. That is exact rather than approximate — but it means a superseded row
 * whose successor is outside the queried window has no observable moment, so the
 * projection always resolves lineage as a whole rather than filtering rows first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoverageAllocation, CoverageTransition } from "@/lib/staffCoverage/staffCoverageService";

export type CoverageAuditOperation =
    | "CREATED"
    | "REVISED"
    | "CORRECTED"
    | "CANCELLED"
    | "SUPERSEDED";

export type CoverageAuditEvent = {
    operation: CoverageAuditOperation;
    coverageId: string;
    lineageRootId: string;
    /** For REVISED/CORRECTED: the retired allocation. For SUPERSEDED: its replacement. */
    counterpartCoverageId: string | null;
    occurredAt: string;
    actorUserId: string | null;
    serviceDate: string;
    employmentId: string;
    siteLocationId: string;
    roomLocationId: string | null;
    startTime: string;
    endTime: string;
    reasonKey: string | null;
    sourceKey: string;
    note: string | null;
};

type Row = Record<string, unknown>;

function toAllocation(r: Row): CoverageAllocation {
    const hhmm = (v: unknown) => {
        const s = String(v ?? "");
        return s.length >= 5 ? s.slice(0, 5) : s;
    };
    return {
        id: String(r.id),
        orgId: String(r.org_id),
        employmentId: String(r.employment_id),
        serviceDate: String(r.service_date),
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        siteLocationId: String(r.site_location_id),
        roomLocationId: (r.room_location_id as string | null) ?? null,
        lifecycleState: r.lifecycle_state as CoverageAllocation["lifecycleState"],
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

const AUDIT_SELECT =
    "id, org_id, employment_id, service_date, start_time, end_time, site_location_id, room_location_id, " +
    "lifecycle_state, transition_type, supersedes_coverage_id, lineage_root_id, reason_key, cancel_reason_key, note, source_key, " +
    "created_by, created_at, cancelled_by, cancelled_at";

/** Every allocation in one lineage, oldest first. */
export async function readCoverageLineage(
    supabase: SupabaseClient,
    input: { orgId: string; lineageRootId: string }
): Promise<CoverageAllocation[]> {
    const { data, error } = await supabase
        .from("staff_coverage_allocations")
        .select(AUDIT_SELECT)
        .eq("org_id", input.orgId)
        .eq("lineage_root_id", input.lineageRootId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
    if (error) throw new Error(`readCoverageLineage: ${error.message}`);
    return ((data ?? []) as unknown as Row[]).map(toAllocation);
}

/**
 * The lineage containing a given allocation. Resolving the root first means an
 * operator can hand over any id from the chain — the one they are looking at —
 * rather than having to already know where the chain began.
 */
export async function readCoverageLineageFor(
    supabase: SupabaseClient,
    input: { orgId: string; coverageId: string }
): Promise<CoverageAllocation[]> {
    const { data, error } = await supabase
        .from("staff_coverage_allocations")
        .select("id, lineage_root_id")
        .eq("org_id", input.orgId)
        .eq("id", input.coverageId)
        .maybeSingle();
    if (error) throw new Error(`readCoverageLineageFor: ${error.message}`);
    if (!data) return [];
    const row = data as { id: string; lineage_root_id: string | null };
    return readCoverageLineage(supabase, { orgId: input.orgId, lineageRootId: row.lineage_root_id ?? row.id });
}

/** Project a lineage into its operator-visible history, oldest first. */
export function projectCoverageAudit(lineage: readonly CoverageAllocation[]): CoverageAuditEvent[] {
    const byId = new Map(lineage.map((a) => [a.id, a]));
    const successorOf = new Map<string, CoverageAllocation>();
    for (const a of lineage) {
        if (a.supersedesCoverageId) successorOf.set(a.supersedesCoverageId, a);
    }

    const base = (a: CoverageAllocation) => ({
        coverageId: a.id,
        lineageRootId: a.lineageRootId ?? a.id,
        serviceDate: a.serviceDate,
        employmentId: a.employmentId,
        siteLocationId: a.siteLocationId,
        roomLocationId: a.roomLocationId,
        startTime: a.startTime,
        endTime: a.endTime,
        reasonKey: a.reasonKey,
        sourceKey: a.sourceKey,
        note: a.note,
    });

    const events: CoverageAuditEvent[] = [];

    for (const a of lineage) {
        if (a.supersedesCoverageId == null) {
            events.push({
                ...base(a),
                operation: "CREATED",
                counterpartCoverageId: null,
                occurredAt: a.createdAt,
                actorUserId: a.createdBy,
            });
        } else {
            const prior = byId.get(a.supersedesCoverageId) ?? null;
            events.push({
                ...base(a),
                operation: a.transitionType === "correction" ? "CORRECTED" : "REVISED",
                counterpartCoverageId: a.supersedesCoverageId,
                occurredAt: a.createdAt,
                actorUserId: a.createdBy,
            });
            if (prior) {
                events.push({
                    ...base(prior),
                    operation: "SUPERSEDED",
                    counterpartCoverageId: a.id,
                    // The retirement IS the replacement's insert — same transaction.
                    occurredAt: a.createdAt,
                    actorUserId: a.createdBy,
                });
            }
        }

        if (a.lifecycleState === "cancelled" && a.cancelledAt) {
            events.push({
                ...base(a),
                operation: "CANCELLED",
                counterpartCoverageId: null,
                occurredAt: a.cancelledAt,
                actorUserId: a.cancelledBy,
                // The cancellation's own reason, not the one the allocation was
                // authored with — those are facts about different moments.
                reasonKey: a.cancelReasonKey,
            });
        }
    }

    return events.sort(
        (x, y) => x.occurredAt.localeCompare(y.occurredAt) || x.operation.localeCompare(y.operation)
    );
}
