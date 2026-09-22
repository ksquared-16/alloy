import "server-only";

/**
 * THE CANONICAL WORK VIEW COUNT EVALUATOR — one predicate implementation, two acquisition paths.
 *
 * `/api/admin/queue-view-totals` and the Work Unit document both need the configured Work Views'
 * counts. They differ ONLY in how they obtain the prerequisite: whether a work unit is accessible
 * to this caller, and which department metadata layer publishes its configuration.
 *
 * The endpoint reacquires that prerequisite per group. Measured deployed at 8c8972d5e the request
 * spans FIVE distinct lifecycle work units at ~401ms each, three reads apiece — a `work_units`
 * existence check, the SAME `work_units` row again for `department_id`, and the `departments`
 * metadata. The document already holds every one of those facts from a single read:
 * `resolveWorkUnitRouteIdentity` fetches the whole lifecycle work-unit set with
 * `departments(id, org_id, key, name, metadata)` embedded, under the same `gate.dim` department
 * scope. Same truth, same grain — but across an HTTP boundary, so it can only be retired by
 * evaluating the counts where that truth already lives.
 *
 * The prerequisite is therefore an INPUT here, never a read. This module performs no authorization
 * and transports no verdict; it is handed one, per request, by whichever caller resolved it, and
 * the predicate cannot tell them apart. That is what keeps counts ONE semantic rather than two.
 *
 * MOVED, NOT REIMPLEMENTED: the body below is the endpoint's own group evaluation relocated
 * verbatim, apart from the acquisition lines and the span accumulator. Copying Work View
 * predicates into a second owner is the defect that once printed thirteen child rows under a pill
 * of eight.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
    WorkViewTotalRow as WorkViewTotalRowContract,
    WorkViewTotalsSpans as WorkViewTotalsSpansContract,
} from "@/lib/runtime/provisioning/workViewTotalsSeedContract";

import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { WORK_VIEW_QUEUE_FILTER_FETCH_CAP } from "@/lib/lifecycle/operationalProjection";
import { getWorkUnitQueueItems } from "@/lib/queues/QueueService";
import { aggregateWorkViewTotals } from "@/lib/queues/aggregateWorkViewTotals";
import {
    countChildGrainMembersForLenses,
    emptyChildMembershipBatchMeasurement,
} from "@/lib/runtime/provisioning/childGrainMembership";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { attachEffectiveEnrollmentStagesToOpportunityRows } from "@/lib/process/definitions/enrollment/attachEffectiveEnrollmentStagesToOpportunityRows";
import { attachActiveTourFactsToOpportunityRows } from "@/lib/tours/queue/attachActiveTourFactsToOpportunityRows";

/** One lane: a (work unit, queue key) pair and the configured views asked of it. */
export type WorkViewTotalsGroup = {
    workUnitId: string;
    queueKey: string;
    viewIds: ReadonlySet<string>;
};

/**
 * What the caller must already know.
 *
 * Both are REQUEST-TIME facts resolved by the caller for this request only. Neither is cached,
 * persisted, nor carried into another request — an access verdict that outlived its request would
 * be exactly the persisted authorization this architecture forbids.
 */
export type WorkViewTotalsPrerequisite = {
    /** Request-time authorization verdict for this work unit, under this caller's own gate. */
    accessible: boolean;
    /** The department metadata layer publishing this work unit's Work View configuration. */
    departmentMetadata: unknown | null;
};

export type { WorkViewTotalRow, WorkViewTotalsSpans } from "@/lib/runtime/provisioning/workViewTotalsSeedContract";
export { emptyWorkViewTotalsSpans } from "@/lib/runtime/provisioning/workViewTotalsSeedContract";



/**
 * WHICH CONFIGURED VIEWS ARE CHILD LENSES — one classification, two callers.
 *
 * The evaluator has always decided this per group. The seed now needs the same answer BEFORE it
 * evaluates any group, because the child acquisition it wants to share is org-scoped and the child
 * lenses are spread across groups — so sharing it per group would share it with nobody.
 *
 * Two callers of one pure function, not two readings. `resolveLensRowGrain` is still the only
 * grain authority and this still asks it exactly once per view per caller; the alternative was the
 * seed re-deriving "is this lens child-grain", which is how a count and its rows come to disagree.
 */
export function classifyRequestedWorkViews(args: {
    metadata: unknown;
    viewIds: ReadonlySet<string>;
}): {
    stages: ReturnType<typeof activeStagesForProcess>;
    childViews: WorkViewConfigV1Stored[];
    laneViews: WorkViewConfigV1Stored[];
    unknownViews: WorkViewConfigV1Stored[];
} {
    const bpProcess = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(args.metadata));
    const stages = bpProcess ? activeStagesForProcess(bpProcess) : [];
    const childViews: WorkViewConfigV1Stored[] = [];
    const laneViews: WorkViewConfigV1Stored[] = [];
    const unknownViews: WorkViewConfigV1Stored[] = [];
    for (const v of savedWorkViewsFromDepartmentMetadata(args.metadata)) {
        if (!args.viewIds.has(v.id)) continue;
        const grain = resolveLensRowGrain(v, stages);
        // Grain must resolve the same way for pills and rows. Ambiguous / refused lenses must NOT
        // fall through to lane population counts (pill=1 / rows=0).
        if (!grain.ok) unknownViews.push(v);
        else if (grain.grain === "child") childViews.push(v);
        else laneViews.push(v);
    }
    return { stages, childViews, laneViews, unknownViews };
}

export async function evaluateWorkViewTotalsForGroup(args: {
    supabase: SupabaseClient;
    orgId: string;
    group: WorkViewTotalsGroup;
    prerequisite: WorkViewTotalsPrerequisite;
    recordScopeConstraints: Parameters<typeof loadWorkUnitProcessPopulation>[0]["scope"];
    recordScopeImpossible: boolean;
    /*
     * The viewer timezone META, not a string. `fetchEffectiveUserDisplayTimezoneCached` returns
     * `{ iana, source, cacheHit }` and `getWorkUnitQueueItems` consumes that shape; typing it as a
     * string compiled against neither caller and was caught only by tsc.
     */
    viewerDisplayTimeZone: Parameters<typeof getWorkUnitQueueItems>[0]["viewerDisplayTimeZone"];
    spans: WorkViewTotalsSpansContract;
    /**
     * ARM SELECTOR, not a feature flag on the answer.
     *
     * True acquires the enrollment child base once for this group's child lenses; false leaves each
     * lens acquiring its own, exactly as before. Both arms run the same membership rules over the
     * same rows and must return the same counts — which is the point: the claim "same answer,
     * cheaper acquisition" is only worth anything if both arms can be measured on one deployed
     * lineage and compared. Defaults to the pre-existing behaviour.
     */
    shareChildAcquisition?: boolean;
    /**
     * An enrollment child base the CALLER acquired for this whole request. The child lenses of one
     * surface sit in different groups, and the base is org-scoped (neither membership rule filters
     * by work unit), so the only place one acquisition can serve all of them is above the groups.
     */
    childBase?: Parameters<typeof countChildGrainMembersForLenses>[0]["base"];
}): Promise<WorkViewTotalRowContract[]> {
    const {
        supabase,
        orgId,
        group,
        prerequisite,
        recordScopeConstraints,
        recordScopeImpossible,
        viewerDisplayTimeZone,
        spans,
    } = args;
    const shareChildAcquisition = args.shareChildAcquisition === true;
    type TotalOut = WorkViewTotalRowContract;
        const unknownAll = (): TotalOut[] =>
            [...group.viewIds].map((workViewId) => ({
                workUnitId: group.workUnitId,
                queueKey: group.queueKey,
                workViewId,
                count: null,
                known: false,
            }));
        try {
            /*
             * ACQUISITION IS THE CALLER'S. This function never reads work_units or departments:
             * the endpoint supplies the verdict from its own per-request acquisition, and the
             * document supplies it from route identity it has ALREADY resolved. The predicate
             * below must not be able to tell which one it got.
             */
            if (!prerequisite.accessible) return unknownAll();
            const metadata = prerequisite.departmentMetadata;

            // ── A CHILD LENS IS COUNTED BY ITS OWN MEMBERSHIP, NOT BY THE OPPORTUNITY LANE. ──
            //
            // Everything below counts the base lane — `opportunities` — and for a stage-INDEPENDENT
            // lens `isWorkViewCatchAll` then returns the lane's exact all-records total. On "All
            // Children in Enrollment" that produced EIGHT (the family cases in scope) beneath THIRTEEN
            // child rows: two honest answers to two different questions, one printed under the other.
            //
            // A child lens is counted by the SAME projection that produced its rows
            // (`countChildGrainMembersForLens` → the provider → the Enrollment Definition's liveness
            // gate), so rows and count cannot drift — there is nothing to drift between.
            const { stages, childViews, laneViews, unknownViews } = classifyRequestedWorkViews({
                metadata,
                viewIds: group.viewIds,
            });

            spans.views += childViews.length + laneViews.length + unknownViews.length;
            spans.child_views += childViews.length;
            spans.lane_views += laneViews.length;
            spans.unknown_views += unknownViews.length;

            const unknownTotals = new Map<string, TotalOut>();
            for (const view of unknownViews) {
                unknownTotals.set(view.id, {
                    workUnitId: group.workUnitId,
                    queueKey: group.queueKey,
                    workViewId: view.id,
                    count: null,
                    known: false,
                });
            }

            /**
             * CONCURRENT, not serial. `countChildGrainMembersForLens` deliberately counts by running
             * the full membership projection — a cheaper `count(*)` would be a second definition of
             * membership, which is what produced 13-vs-8 — so each view here costs a whole
             * projection. Awaiting them one at a time multiplied that by the number of child lenses:
             * this endpoint measured 3.1-3.8s on a work unit with six work views.
             *
             * Each view keeps its OWN try/catch, so one lens that fails still yields UNKNOWN for
             * itself and never a family number borrowed from another lens. Same queries, same
             * results, same per-view failure semantics — just not one at a time.
             */
            const childTotals = new Map<string, TotalOut>();
            if (childViews.length) {
                const measurement = emptyChildMembershipBatchMeasurement();
                const tChild = Date.now();
                const counts = await countChildGrainMembersForLenses({
                    supabase,
                    orgId,
                    workUnitId: group.workUnitId,
                    views: childViews,
                    shareAcquisition: shareChildAcquisition,
                    base: args.childBase,
                    measurement,
                });
                spans.child_counts += Date.now() - tChild;
                spans.child_batches.push(measurement);
                for (const view of childViews) {
                    const base = { workUnitId: group.workUnitId, queueKey: group.queueKey, workViewId: view.id };
                    const count = counts.get(view.id) ?? null;
                    // UNKNOWN, never a family number. A wrong count is worse than an absent one —
                    // the client keeps its prior value and shows none, rather than captioning
                    // child rows with a count of something else.
                    childTotals.set(
                        view.id,
                        count === null
                            ? ({ ...base, count: null, known: false } as TotalOut)
                            : ({ ...base, count, known: true } as TotalOut),
                    );
                }
            }

            // Every requested view is a child lens (or unknown) → the opportunity lane is never read.
            if (laneViews.length === 0) {
                return [...group.viewIds].map(
                    (workViewId) =>
                        childTotals.get(workViewId) ??
                        unknownTotals.get(workViewId) ?? {
                            workUnitId: group.workUnitId,
                            queueKey: group.queueKey,
                            workViewId,
                            count: null,
                            known: false,
                        },
                );
            }
            // ── A WORK VIEW IS COUNTED OVER THE PROCESS POPULATION, NOT AN EXECUTION LANE. ──
            //
            // The lane path below (`getWorkUnitQueueItems(queueKey)`) counts a status-filtered SLICE of
            // the process. `findAllRecordsQueueKey` hands back `primary_total_queue` without checking
            // whether it is filtered, so on Firefly the "all records" lane IS `lifecycle_lead`, whose
            // allowlist is `case_status in (open, new_inquiry, new)`. A family sitting at
            // `tour_scheduled` is invisible to it — so "All Leads" (an include-all view) counted 7
            // while the answer rendered 8, and every stage-scoped family view undercounted the same way.
            //
            // Where the Work Unit is governed by a Business Process, its population is knowable
            // directly and is exactly what the provisioning answer publishes rows from. Counting over
            // THAT makes rows and counts one answer, for every view, with the SAME predicate evaluator
            // (`computeOperationalProjection`) applied on top — predicates are unchanged; only the
            // population they run over stops being a worklist.
            //
            // Work units with no Business Process (no stages) keep the lane path untouched.
            let totals: Record<string, { count: number; known: boolean }>;
            if (stages.length > 0) {
                const tPop = Date.now();
                const population = await loadWorkUnitProcessPopulation({
                    supabase,
                    orgId,
                    workUnitId: group.workUnitId,
                    scope: recordScopeConstraints,
                    scopeImpossible: recordScopeImpossible,
                });
                spans.population += Date.now() - tPop;
                // EPP before Work View totals — same keys as D1 provisioning rows.
                const tEpp = Date.now();
                const baseWithEpp = await attachEffectiveEnrollmentStagesToOpportunityRows({
                    supabase,
                    orgId,
                    rows: population.rows,
                    allowedLocationIds: recordScopeConstraints?.locationIds ?? null,
                    logLabel: "queue-view-totals",
                });
                spans.epp += Date.now() - tEpp;
                const tTours = Date.now();
                const baseWithTourFacts = await attachActiveTourFactsToOpportunityRows({
                    supabase,
                    orgId,
                    rows: baseWithEpp,
                    logLabel: "queue-view-totals",
                });
                spans.tours += Date.now() - tTours;
                const tAgg = Date.now();
                totals = aggregateWorkViewTotals({
                    baseRows: baseWithTourFacts,
                    workViews: laneViews,
                    // An include-all view is the population itself. There is no separate "lane total" to
                    // prefer — preferring one is what substituted a worklist for the process.
                    exactLaneTotal: population.truncated ? null : population.rows.length,
                    baseTruncated: population.truncated,
                });
                spans.aggregate += Date.now() - tAgg;
            } else {
                // ONE base-lane fetch (exact all-records count + up to the cap of rows) for the whole
                // group. COUNT-ONLY: the base-query operational fields carry the Work-View predicates —
                // a total must never materialize presentation rows (persons/customers/household/
                // activity/tasks/comms). Deployed defect fixed: this was `queue_list` (full enrichment).
                const { result } = await getWorkUnitQueueItems({
                    orgId,
                    workUnitId: group.workUnitId,
                    queueKey: group.queueKey,
                    limit: WORK_VIEW_QUEUE_FILTER_FETCH_CAP,
                    offset: 0,
                    countAccuracy: undefined,
                    omitTotalCount: false,
                    recordScopeImpossible,
                    recordScopeConstraints,
                    viewerDisplayTimeZone,
                    attentionBucketKey: null,
                    rowEnrichment: "count_only",
                });
                const items = Array.isArray(result.items) ? result.items : [];
                totals = aggregateWorkViewTotals({
                    baseRows: items as Record<string, unknown>[],
                    workViews: laneViews,
                    exactLaneTotal: typeof result.total === "number" ? result.total : null,
                    baseTruncated: items.length >= WORK_VIEW_QUEUE_FILTER_FETCH_CAP,
                });
            }
            return [...group.viewIds].map((workViewId) => {
                const child = childTotals.get(workViewId);
                if (child) return child;
                const unknown = unknownTotals.get(workViewId);
                if (unknown) return unknown;
                const t = totals[workViewId];
                return {
                    workUnitId: group.workUnitId,
                    queueKey: group.queueKey,
                    workViewId,
                    count: t ? t.count : null,
                    known: t ? t.known : false,
                };
            });
        } catch {
            // A single failing lane degrades to unknown for its views; the client keeps prior counts.
            return unknownAll();
        }
}
