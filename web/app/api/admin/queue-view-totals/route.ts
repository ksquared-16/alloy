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
            const savedViews = savedWorkViewsFromDepartmentMetadata(await deptMetadata(group.workUnitId));
            const requestedViews = savedViews.filter((v) => group.viewIds.has(v.id));
            // ONE base-lane fetch (exact all-records count + up to the cap of rows) for the whole group.
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
                rowEnrichment: "queue_list",
            });
            const items = Array.isArray(result.items) ? result.items : [];
            const totals = aggregateWorkViewTotals({
                baseRows: items as Record<string, unknown>[],
                workViews: requestedViews,
                exactLaneTotal: typeof result.total === "number" ? result.total : null,
                baseTruncated: items.length >= WORK_VIEW_QUEUE_FILTER_FETCH_CAP,
            });
            return [...group.viewIds].map((workViewId) => {
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
