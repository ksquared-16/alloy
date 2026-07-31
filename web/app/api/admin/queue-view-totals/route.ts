import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    accessScopeRestrictsData,
    departmentIdAllowed,
    fetchWorkUnitDepartmentId,
} from "@/lib/admin/accessScope";
import { resolveQueueRecordScopeConstraints } from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezoneCached } from "@/lib/admin/timezoneContract";
import { getWorkUnitQueueItems } from "@/lib/queues/QueueService";
import { WORK_VIEW_QUEUE_FILTER_FETCH_CAP } from "@/lib/lifecycle/operationalProjection";
import {
    fetchDepartmentMetadataForWorkUnit,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { aggregateWorkViewTotals } from "@/lib/queues/aggregateWorkViewTotals";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { countChildGrainMembersForLens } from "@/lib/runtime/provisioning/childGrainMembership";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { mapWithConcurrencyLimit } from "@/lib/workspace/mapWithConcurrencyLimit";
import { buildQueueRowsServerTimingHeader } from "@/lib/perf/queueRowsServerTiming";

/**
 * POST /api/admin/queue-view-totals — grouped canonical Work View totals (Trust Closure).
 *
 * One request resolves counts for MANY (workUnitId, queueKey, workViewId) targets, replacing the
 * per-view HTTP fan-out. Authorization, record scope, and viewer timezone are prepared ONCE; each
 * distinct work unit's access check and department metadata are memoized per request; each distinct
 * (workUnitId, queueKey) lane is fetched ONCE and every requested view's count is computed from that
 * one base page via the canonical projection (`aggregateWorkViewTotals` → `computeOperationalProjection`).
 * Counts are identical to the single queue route by construction (same predicate evaluator).
 */

type TotalTarget = { workUnitId: string; queueKey: string; workViewId: string };

const MAX_TARGETS = 60;

function parseTargets(body: unknown): { targets: TotalTarget[]; selectedSiteId: string | null } | null {
    if (!body || typeof body !== "object") return null;
    const rawTargets = (body as { targets?: unknown }).targets;
    if (!Array.isArray(rawTargets)) return null;
    const targets: TotalTarget[] = [];
    for (const t of rawTargets.slice(0, MAX_TARGETS)) {
        const workUnitId = typeof (t as TotalTarget)?.workUnitId === "string" ? (t as TotalTarget).workUnitId.trim() : "";
        const queueKey = typeof (t as TotalTarget)?.queueKey === "string" ? (t as TotalTarget).queueKey.trim() : "";
        const workViewId = typeof (t as TotalTarget)?.workViewId === "string" ? (t as TotalTarget).workViewId.trim() : "";
        if (workUnitId && queueKey && workViewId) targets.push({ workUnitId, queueKey, workViewId });
    }
    const siteRaw = (body as { selectedSiteId?: unknown }).selectedSiteId;
    const selectedSiteId = typeof siteRaw === "string" && siteRaw.trim() ? siteRaw.trim() : null;
    return { targets, selectedSiteId };
}

export async function POST(request: NextRequest) {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const parsed = parseTargets(await request.json().catch(() => null));
    if (!parsed) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (parsed.targets.length === 0) {
        return NextResponse.json({ generatedAt: new Date().toISOString(), totals: [] });
    }

    const supabase = createAdminClient();
    const [scopeBundle, viewerDisplayTimeZone] = await Promise.all([
        resolveQueueRecordScopeConstraints(supabase, gate.orgId, dim, parsed.selectedSiteId),
        fetchEffectiveUserDisplayTimezoneCached(supabase, { orgId: gate.orgId, userId: gate.userId }),
    ]);
    const { recordScopeImpossible, recordScopeConstraints } = scopeBundle;

    // Request-scoped memoization: each distinct work unit resolves access + department metadata ONCE.
    const accessByWu = new Map<string, Promise<boolean>>();
    const deptMetaByWu = new Map<string, Promise<unknown | null>>();
    const workUnitAccessible = (workUnitId: string): Promise<boolean> => {
        let p = accessByWu.get(workUnitId);
        if (!p) {
            p = (async () => {
                const exists = await supabase
                    .from("work_units")
                    .select("id")
                    .eq("id", workUnitId)
                    .eq("org_id", gate.orgId)
                    .eq("is_active", true)
                    .maybeSingle();
                if (!exists.data) return false;
                if (accessScopeRestrictsData(dim) && dim.departmentScope === "restricted") {
                    const deptId = await fetchWorkUnitDepartmentId(supabase, gate.orgId, workUnitId);
                    if (!departmentIdAllowed(dim, deptId)) return false;
                }
                return true;
            })();
            accessByWu.set(workUnitId, p);
        }
        return p;
    };
    const deptMetadata = (workUnitId: string): Promise<unknown | null> => {
        let p = deptMetaByWu.get(workUnitId);
        if (!p) {
            p = fetchDepartmentMetadataForWorkUnit(supabase, gate.orgId, workUnitId);
            deptMetaByWu.set(workUnitId, p);
        }
        return p;
    };

    // Group targets by lane (workUnitId, queueKey): each lane is fetched exactly once.
    const groups = new Map<string, { workUnitId: string; queueKey: string; viewIds: Set<string> }>();
    for (const t of parsed.targets) {
        const laneKey = `${t.workUnitId}::${t.queueKey}`;
        let g = groups.get(laneKey);
        if (!g) {
            g = { workUnitId: t.workUnitId, queueKey: t.queueKey, viewIds: new Set() };
            groups.set(laneKey, g);
        }
        g.viewIds.add(t.workViewId);
    }

    type TotalOut = { workUnitId: string; queueKey: string; workViewId: string; count: number | null; known: boolean };

    const perGroup = await mapWithConcurrencyLimit([...groups.values()], 4, async (group): Promise<TotalOut[]> => {
        const unknownAll = (): TotalOut[] =>
            [...group.viewIds].map((workViewId) => ({
                workUnitId: group.workUnitId,
                queueKey: group.queueKey,
                workViewId,
                count: null,
                known: false,
            }));
        try {
            if (!(await workUnitAccessible(group.workUnitId))) return unknownAll();
            const metadata = await deptMetadata(group.workUnitId);
            const savedViews = savedWorkViewsFromDepartmentMetadata(metadata);
            const requestedViews = savedViews.filter((v) => group.viewIds.has(v.id));

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
            const bpProcess = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(metadata));
            const stages = bpProcess ? activeStagesForProcess(bpProcess) : [];
            const childViews: WorkViewConfigV1Stored[] = [];
            const laneViews: WorkViewConfigV1Stored[] = [];
            for (const v of requestedViews) {
                const grain = resolveLensRowGrain(v, stages);
                // Resolved, never guessed: a lens whose grain will not resolve keeps the existing lane
                // behaviour rather than being assumed into either path.
                (grain.ok && grain.grain === "child" ? childViews : laneViews).push(v);
            }

            const childTotals = new Map<string, TotalOut>();
            for (const view of childViews) {
                const base = { workUnitId: group.workUnitId, queueKey: group.queueKey, workViewId: view.id };
                try {
                    const count = await countChildGrainMembersForLens({
                        supabase,
                        orgId: gate.orgId,
                        workUnitId: group.workUnitId,
                        view,
                    });
                    childTotals.set(view.id, { ...base, count, known: true });
                } catch {
                    // UNKNOWN, never a family number. A wrong count is worse than an absent one — the
                    // client keeps its prior value and shows none, rather than captioning child rows
                    // with a count of something else.
                    childTotals.set(view.id, { ...base, count: null, known: false });
                }
            }

            // Every requested view is a child lens → the opportunity lane is never read.
            if (laneViews.length === 0) {
                return [...group.viewIds].map(
                    (workViewId) =>
                        childTotals.get(workViewId) ?? {
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
                const population = await loadWorkUnitProcessPopulation({
                    supabase,
                    orgId: gate.orgId,
                    workUnitId: group.workUnitId,
                    scope: recordScopeConstraints,
                    scopeImpossible: recordScopeImpossible,
                });
                totals = aggregateWorkViewTotals({
                    baseRows: population.rows,
                    workViews: laneViews,
                    // An include-all view is the population itself. There is no separate "lane total" to
                    // prefer — preferring one is what substituted a worklist for the process.
                    exactLaneTotal: population.truncated ? null : population.rows.length,
                    baseTruncated: population.truncated,
                });
            } else {
                // ONE base-lane fetch (exact all-records count + up to the cap of rows) for the whole
                // group. COUNT-ONLY: the base-query operational fields carry the Work-View predicates —
                // a total must never materialize presentation rows (persons/customers/household/
                // activity/tasks/comms). Deployed defect fixed: this was `queue_list` (full enrichment).
                const { result } = await getWorkUnitQueueItems({
                    orgId: gate.orgId,
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
    });

    const totals = perGroup.flat();
    return NextResponse.json(
        { generatedAt: new Date().toISOString(), totals },
        { headers: { "Server-Timing": buildQueueRowsServerTimingHeader({ metrics: { total: Date.now() - t0 } }) } },
    );
}
