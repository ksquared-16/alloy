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
import { fetchDepartmentMetadataForWorkUnit } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { mapWithConcurrencyLimit } from "@/lib/workspace/mapWithConcurrencyLimit";
import { buildQueueRowsServerTimingHeader } from "@/lib/perf/queueRowsServerTiming";
import {
    emptyWorkViewTotalsSpans,
    evaluateWorkViewTotalsForGroup,
} from "@/lib/queues/evaluateWorkViewTotalsForGroup";

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
    /*
     * PHASE CLOCKS — because this endpoint's single `total` is now the product's completion owner.
     *
     * Measured deployed it costs ~1,934ms and WU-03's final authoritative mutation lands ~11ms after
     * it returns, so this number IS FIRST_ORDER_VISIBLE_COMPLETE. One total cannot say which phase
     * owns it, and the candidates need opposite repairs: a population read the document composer has
     * already performed, two database enrichments the composer gets free from maintained facts, and
     * a per-child-lens membership projection that fans out with configuration.
     *
     * Phases inside the concurrent per-group map ACCUMULATE across groups, so they are sums of
     * concurrent work and DO NOT add up to the wall. That is stated rather than hidden: attributing
     * a wall to a sum of overlapping spans is the mistake this programme has already made twice.
     */
    const span = {
        qvt_gate: 0,
        qvt_scope: 0,
        qvt_access: 0,
    };
    // Cardinalities the ROUTE owns. The per-view splits come from the evaluator, which is the only
    // thing that knows how each configured view resolved.
    const counts = { groups: 0 };
    const tGate = Date.now();
    const gate = await loadAdminRouteGate();
    span.qvt_gate = Date.now() - tGate;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const parsed = parseTargets(await request.json().catch(() => null));
    if (!parsed) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (parsed.targets.length === 0) {
        return NextResponse.json({ generatedAt: new Date().toISOString(), totals: [] });
    }

    const supabase = createAdminClient();
    const tScope = Date.now();
    const [scopeBundle, viewerDisplayTimeZone] = await Promise.all([
        resolveQueueRecordScopeConstraints(supabase, gate.orgId, dim, parsed.selectedSiteId),
        fetchEffectiveUserDisplayTimezoneCached(supabase, { orgId: gate.orgId, userId: gate.userId }),
    ]);
    span.qvt_scope = Date.now() - tScope;
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

    counts.groups = groups.size;
    const evalSpans = emptyWorkViewTotalsSpans();
    const perGroup = await mapWithConcurrencyLimit([...groups.values()], 4, async (group): Promise<TotalOut[]> => {
        const unknownAll = (): TotalOut[] =>
            [...group.viewIds].map((workViewId) => ({
                workUnitId: group.workUnitId,
                queueKey: group.queueKey,
                workViewId,
                count: null,
                known: false,
            }));
        /*
         * ACQUISITION STAYS HERE; EVALUATION MOVED.
         *
         * This endpoint owns its own prerequisite: it has no document to inherit one from. The
         * document path resolves the same two facts from route identity it has already read, and
         * both hand them to the SAME evaluator, so the counting predicate has exactly one
         * implementation and cannot drift between the two callers.
         *
         * The acquisition keeps the original failure contract: anything thrown while resolving
         * access or metadata degrades this lane to UNKNOWN for its views — never to zero, and
         * never to a number borrowed from another lane.
         */
        let accessible = false;
        let departmentMetadata: unknown = null;
        const tAccess = Date.now();
        try {
            accessible = await workUnitAccessible(group.workUnitId);
            departmentMetadata = accessible ? await deptMetadata(group.workUnitId) : null;
        } catch {
            span.qvt_access += Date.now() - tAccess;
            return unknownAll();
        }
        span.qvt_access += Date.now() - tAccess;
        return evaluateWorkViewTotalsForGroup({
            supabase,
            orgId: gate.orgId,
            group,
            prerequisite: { accessible, departmentMetadata },
            recordScopeConstraints,
            recordScopeImpossible,
            viewerDisplayTimeZone,
            spans: evalSpans,
        });
    });

    const totals = perGroup.flat();
    return NextResponse.json(
        { generatedAt: new Date().toISOString(), totals },
        {
            headers: {
                "Server-Timing": buildQueueRowsServerTimingHeader({
                    /*
                     * BOTH accumulators are SPREAD. Restating field names is how `financials` was
                     * dropped to null on every deployed sample while nineteen local gates passed.
                     */
                    metrics: {
                        ...span,
                        qvt_child_counts: evalSpans.child_counts,
                        qvt_population: evalSpans.population,
                        qvt_epp: evalSpans.epp,
                        qvt_tours: evalSpans.tours,
                        qvt_aggregate: evalSpans.aggregate,
                        total: Date.now() - t0,
                    },
                    counts: {
                        ...counts,
                        views: evalSpans.views,
                        child_views: evalSpans.child_views,
                        lane_views: evalSpans.lane_views,
                        unknown_views: evalSpans.unknown_views,
                    },
                }),
            },
        },
    );
}
