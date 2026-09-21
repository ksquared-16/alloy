/**
 * ONE MEMBERSHIP PROJECTION FOR A CHILD LENS — rows AND counts.
 *
 * THE DEFECT THIS EXISTS TO REMOVE. "All Children in Enrollment" rendered thirteen child rows under a
 * pill that said eight. Both numbers were computed honestly; they were answers to different questions.
 * The rows came from the child provider (live enrollment participations). The count came from
 * `aggregateWorkViewTotals`, which counts the OPPORTUNITY base lane — and because a stage-independent
 * lens has no predicates, `isWorkViewCatchAll` treated it as include-all and handed back the lane's
 * exact all-records total: eight family cases. The count path never asked the lens what its rows ARE.
 *
 * A count that disagrees with the rows beneath it is worse than a missing count: it is the surface
 * telling an operator two different things at once and giving no way to tell which is true.
 *
 * So membership is defined ONCE, here, and both the rows and the count are derived from it. Not a
 * count patched to match the rows — the same projection, read twice. They cannot drift, because there
 * is nothing to drift between.
 *
 * WHAT IS NOT RE-DECIDED HERE. Nothing. `lensStageKeys` still reads the lens, the provider still owns
 * the query, and the Enrollment Definition's `isLiveEnrollmentParticipant` is still the only liveness
 * authority (via `queryEnrollmentProcessInstanceParticipationRows`). This module only names the rule
 * that was previously written inline in the provisioning answer, so a second caller can obey it
 * instead of inventing its own.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    loadChildGrainProvisioningRows,
    type ChildProvisioningRow,
    type ChildRowMembership,
} from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import {
    acquireEnrollmentChildBase,
    emptyChildGrainTrace,
    type ChildGrainTrace,
    type EnrollmentChildBase,
} from "@/lib/queues/childGrainProcessInstanceQueue";
// From its own module, NOT from the provisioning answer — importing the answer here would make a cycle
// out of a one-way dependency (the answer consumes this).
import { lensStageKeys } from "@/lib/lifecycle/lensStageKeys";

/**
 * WHICH CHILDREN THIS LENS CONTAINS — the one derivation.
 *
 * A stage-scoped child lens (Registration, Waitlist) means "children at these stages". A
 * stage-INDEPENDENT one means "children whose enrollment journey is still running", which is a
 * different question and not the first one run over every stage: enumerating stages would admit a
 * child whose own participation is closed while the family case still sits in an active stage.
 */
export function childRowMembershipForLens(view: WorkViewConfigV1Stored): ChildRowMembership {
    const stageKeys = lensStageKeys(view);
    return stageKeys.length ? { mode: "stages", stageKeys } : { mode: "participation" };
}

/**
 * The lens's child members. The provisioning answer publishes these as rows; the totals route counts
 * them. Same call, same rule, same liveness gate — so `rows.length === pill count` by construction
 * rather than by agreement.
 *
 * THROWS on read failure, exactly as the provider does. A caller that cannot read must say so (the
 * answer refuses with `records_unavailable`; the totals route reports the count as UNKNOWN). Neither
 * may degrade to a family number — a family count under child rows is the very defect above.
 */
export async function loadChildGrainMembersForLens(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    view: WorkViewConfigV1Stored;
}): Promise<ChildProvisioningRow[]> {
    return loadChildGrainProvisioningRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        membership: childRowMembershipForLens(params.view),
    });
}

/**
 * The lens's child member COUNT.
 *
 * Deliberately counts the projected members rather than issuing a cheaper `count(*)`. A separate
 * counting query would be a second definition of membership — the exact thing that produced 13-vs-8 —
 * and the liveness gate is a predicate over the composed participant, not a WHERE clause that could be
 * pushed into SQL without restating it. Correctness here is worth more than a round trip, and the
 * result is bounded by the same work-unit scope the rows already are.
 *
 * This does NOT touch the enrichment-independent count doctrine: that invariant governs the
 * OPPORTUNITY `count_only` path (no `activity_timeline_events`, no presentation batch fetches), which
 * this path does not enter at all.
 */
export async function countChildGrainMembersForLens(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    view: WorkViewConfigV1Stored;
}): Promise<number> {
    const rows = await loadChildGrainMembersForLens(params);
    return rows.length;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * COUNTING SEVERAL LENSES OF THE SAME WORK UNIT
 *
 * Measured deployed at 445bc8b23, the three child lenses on WU-03 cost 1,537ms of the 646ms Work
 * View seed — the binding term of a frame whose target is 800ms. Each lens ran the full membership
 * projection, and three lenses meant THREE acquisitions of the same org's enrollment instances and
 * three resolutions of the same opportunities, children and program categories.
 *
 * The expensive thing was never the predicate. It was asking the database the same question once
 * per lens.
 *
 * SAME MEMBERSHIP ANSWER, CHEAPER ACQUISITION. Nothing below decides who is a member.
 * `childRowMembershipForLens` still reads the lens, `loadChildGrainProvisioningRows` still applies
 * the rule, and the Enrollment Definition's `isLiveEnrollmentParticipant` is still the only
 * liveness authority. The single change is that the rows those rules run over are acquired once.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** What one lens cost, and what it answered. Diagnostic only. */
export type ChildLensMeasurement = {
    viewId: string;
    mode: "stages" | "participation";
    stages: number;
    /** Wall of this lens alone — acquisition included only when it did its own. */
    ms: number;
    /** Members found; null when the lens refused. */
    outRows: number | null;
    shared: boolean;
    acquisition: ChildGrainTrace;
};

export type ChildMembershipBatchMeasurement = {
    shared: boolean;
    baseScope: "all" | "stages" | "none";
    baseStages: number;
    baseMs: number;
    base: ChildGrainTrace;
    lenses: ChildLensMeasurement[];
};

export function emptyChildMembershipBatchMeasurement(): ChildMembershipBatchMeasurement {
    return { shared: false, baseScope: "none", baseStages: 0, baseMs: 0, base: emptyChildGrainTrace(), lenses: [] };
}

/**
 * The acquisition scope a set of lenses needs.
 *
 * A participation lens asks about the whole enrollment population, so any lens in that mode forces
 * the unscoped base. Otherwise the union of the stage sets is enough, and is strictly narrower.
 */
export function childBaseScopeForLenses(
    views: readonly WorkViewConfigV1Stored[],
): { stageKeys: string[] | null } {
    const stageKeys = new Set<string>();
    for (const view of views) {
        const membership = childRowMembershipForLens(view);
        if (membership.mode === "participation") return { stageKeys: null };
        for (const key of membership.stageKeys) {
            const k = key.trim();
            if (k) stageKeys.add(k);
        }
    }
    return { stageKeys: [...stageKeys] };
}

/**
 * Count every child lens of one work unit.
 *
 * Returns a count per view id, or null for a view whose own evaluation refused — the caller turns
 * that into UNKNOWN, never into a family number.
 *
 * `shareAcquisition: false` reproduces the per-lens behaviour exactly (each lens acquires its own
 * base), so the two arms can be measured against each other on one deployed lineage before either
 * is made the only one.
 *
 * A FAILED SHARED ACQUISITION FAILS EVERY LENS. That is honest: the acquisition is the read all of
 * them were already making, so a failure that would have refused one lens refuses all of them
 * either way. What must not happen — and does not — is a lens answering from a base that does not
 * cover it; both membership rules refuse that themselves.
 */
export async function countChildGrainMembersForLenses(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    views: readonly WorkViewConfigV1Stored[];
    shareAcquisition: boolean;
    /**
     * A base the CALLER already acquired for this request. The child lenses of one surface are
     * spread across count groups and the base is org-scoped, so a base acquired here could only
     * ever be shared with the lenses of one group — often exactly one lens, which shares nothing.
     * When the caller supplies one, no acquisition happens here at all.
     */
    base?: EnrollmentChildBase;
    measurement?: ChildMembershipBatchMeasurement;
}): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (!params.views.length) return out;

    let base: EnrollmentChildBase | undefined = params.base;
    if (base && params.measurement) {
        params.measurement.shared = true;
        params.measurement.baseScope = base.scope === "all" ? "all" : "stages";
        params.measurement.baseStages = base.scope === "all" ? 0 : base.scope.stageKeys.length;
        params.measurement.baseMs = 0; // acquired above this call; the caller reports its cost
    }
    if (!base && params.shareAcquisition) {
        const scope = childBaseScopeForLenses(params.views);
        const baseTrace = emptyChildGrainTrace();
        const t0 = Date.now();
        try {
            base = await acquireEnrollmentChildBase({
                supabase: params.supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                stageKeys: scope.stageKeys,
                trace: baseTrace,
            });
        } catch {
            if (params.measurement) {
                params.measurement.shared = true;
                params.measurement.baseScope = scope.stageKeys === null ? "all" : "stages";
                params.measurement.baseStages = scope.stageKeys?.length ?? 0;
                params.measurement.baseMs = Date.now() - t0;
                params.measurement.base = baseTrace;
            }
            for (const view of params.views) out.set(view.id, null);
            return out;
        }
        if (params.measurement) {
            params.measurement.shared = true;
            params.measurement.baseScope = base.scope === "all" ? "all" : "stages";
            params.measurement.baseStages = base.scope === "all" ? 0 : base.scope.stageKeys.length;
            params.measurement.baseMs = Date.now() - t0;
            params.measurement.base = baseTrace;
        }
    }

    const counted = await Promise.all(
        params.views.map(async (view) => {
            const membership = childRowMembershipForLens(view);
            const trace = emptyChildGrainTrace();
            const t0 = Date.now();
            let count: number | null;
            try {
                const rows = await loadChildGrainProvisioningRows({
                    supabase: params.supabase,
                    orgId: params.orgId,
                    workUnitId: params.workUnitId,
                    membership,
                    base,
                    trace,
                });
                count = rows.length;
            } catch {
                count = null;
            }
            const measure: ChildLensMeasurement = {
                viewId: view.id,
                mode: membership.mode,
                stages: membership.mode === "stages" ? membership.stageKeys.length : 0,
                ms: Date.now() - t0,
                outRows: count,
                shared: base !== undefined,
                acquisition: trace,
            };
            return { id: view.id, count, measure };
        }),
    );

    for (const { id, count, measure } of counted) {
        out.set(id, count);
        params.measurement?.lenses.push(measure);
    }
    return out;
}
