import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    buildOperatorLifecycleLandingCards,
    type OperatorLifecycleDepartmentRow,
    type OperatorLifecycleLandingCard,
    type OperatorLifecycleWorkUnitRow,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    applyOperatorLifecycleLandingRollups,
    applyWorkViewOperationalSignalsToCards,
    resolveLifecycleRollupsFromDepartmentSummaries,
    type LifecycleDepartmentSummariesResponse,
} from "@/lib/admin/resolveOperatorLifecycleLandingRollups";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    enrichEnrollmentOperationalSurfaceForDepartment,
    enrollmentOperationalSurfaceNeedsHydration,
} from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetchWithTtl, LIFECYCLE_SIBLING_FETCH_TTL_MS } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import {
    computeWorkViewOperationalSignals,
    type OperationalProjectionRow,
    type StatusStageMap,
    type WorkViewOperationalSignals,
} from "@/lib/lifecycle/operationalProjection";

/** Cap on all-records base rows fetched for the operational projection (per department pipeline). */
const PROJECTION_BASE_ROWS_LIMIT = 500;

/**
 * Fetch the all-records base rows (`pipeline_total`) for a department's enrollment pipeline work unit.
 * These feed the canonical operational projection so per-Work-View counts are predicate-filtered (and
 * agree with the queue rows), instead of lane-membership summaries that drop predicate-only views.
 */
async function fetchPipelineBaseRowsForDepartment(
    departmentId: string,
    workUnits: OperatorLifecycleWorkUnitRow[],
    init: RequestInit,
): Promise<OperationalProjectionRow[] | null> {
    const forDept = workUnits.filter((w) => (w as { department_id?: string }).department_id === departmentId);
    const pipelineWu = pickDeptPipelineWorkUnit(forDept, departmentId);
    if (!pipelineWu) return null;
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(pipelineWu.queue_definition);
    if (!bundle) return null;
    const allRecordsKey = findAllRecordsQueueKey(bundle.def, getQueueUiConfig(bundle.def));
    if (!allRecordsKey) return null;
    try {
        const res = await dedupeAdminFetchWithTtl(
            `/api/admin/queues/${encodeURIComponent(pipelineWu.id)}/${encodeURIComponent(allRecordsKey)}?limit=${PROJECTION_BASE_ROWS_LIMIT}&offset=0&omit_total_count=true&count_mode=planned`,
            init,
            LIFECYCLE_SIBLING_FETCH_TTL_MS,
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { items?: OperationalProjectionRow[] };
        return Array.isArray(json.items) ? json.items : null;
    } catch {
        return null;
    }
}

type LifecycleCatalogResponse = { items?: LifecycleCatalogEntry[]; error?: string };
type WorkUnitsResponse = { items?: OperatorLifecycleWorkUnitRow[]; error?: string };
type DepartmentsResponse = { items?: OperatorLifecycleDepartmentRow[]; error?: string };

let inflight: Promise<OperatorLifecycleLandingCard[]> | null = null;
let cachedCards: OperatorLifecycleLandingCard[] | null = null;

export function peekOperatorLifecycleLandingCards(): OperatorLifecycleLandingCard[] | null {
    const cached = cachedCards;
    if (cached?.length && enrollmentOperationalSurfaceNeedsHydration(cached)) {
        return null;
    }
    return cached;
}

export function invalidateOperatorLifecycleLandingCache(): void {
    inflight = null;
    cachedCards = null;
}

/**
 * `status_key → process_stage_key` for opportunities — lets the operational projection derive a record's
 * Stage from its status (opportunities store no stage), so Stage Work View predicates (e.g. New Leads =
 * stage "lead") evaluate. Org-wide; fetched once per rollup pass.
 */
async function fetchOpportunityStatusStageMap(init: RequestInit): Promise<StatusStageMap | null> {
    try {
        const res = await dedupeAdminFetchWithTtl(
            "/api/admin/status-options?entity_type=opportunities",
            init,
            LIFECYCLE_SIBLING_FETCH_TTL_MS,
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { options?: { value?: string; process_stage_key?: string | null }[] };
        const map: StatusStageMap = {};
        for (const o of json.options ?? []) {
            const status = String(o.value ?? "").trim();
            const stage = String(o.process_stage_key ?? "").trim();
            if (status && stage) map[status] = stage;
        }
        return Object.keys(map).length ? map : null;
    } catch {
        return null;
    }
}

async function fetchLifecycleRollupsForCards(
    cards: OperatorLifecycleLandingCard[],
    workUnits: OperatorLifecycleWorkUnitRow[],
    departments: OperatorLifecycleDepartmentRow[],
    init: RequestInit,
): Promise<OperatorLifecycleLandingCard[]> {
    const departmentIds = [...new Set(cards.map((c) => c.departmentId).filter(Boolean))];
    if (!departmentIds.length) return cards;

    const statusStageMap = await fetchOpportunityStatusStageMap(init);

    const summariesByDept = await Promise.all(
        departmentIds.map(async (departmentId) => {
            // Summaries (lane rollups) and the all-records base rows (operational projection) in parallel —
            // one extra base-rows fetch per department, not a duplicate of any existing fetch.
            const [res, baseRows] = await Promise.all([
                dedupeAdminFetchWithTtl(
                    `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5`,
                    init,
                    LIFECYCLE_SIBLING_FETCH_TTL_MS,
                ),
                fetchPipelineBaseRowsForDepartment(departmentId, workUnits, init),
            ]);
            const json = (res.ok ? await res.json() : {}) as LifecycleDepartmentSummariesResponse;
            return { departmentId, summaries: json.work_units ?? [], baseRows };
        }),
    );

    const rollupsByLifecycleId = new Map(
        cards.map((card) => {
            const deptSummaries = summariesByDept.find((row) => row.departmentId === card.departmentId);
            const rollups = resolveLifecycleRollupsFromDepartmentSummaries({
                departmentId: card.departmentId,
                workUnits,
                summaries: deptSummaries?.summaries ?? [],
            });
            return [card.id, rollups] as const;
        }),
    );

    let enriched = applyOperatorLifecycleLandingRollups(cards, rollupsByLifecycleId);

    const departmentsById = new Map(departments.map((d) => [d.id, d] as const));

    for (const departmentId of departmentIds) {
        const deptSummaries = summariesByDept.find((row) => row.departmentId === departmentId);
        enriched = enrichEnrollmentOperationalSurfaceForDepartment({
            cards: enriched,
            departmentId,
            departmentMetadata: departmentsById.get(departmentId)?.metadata,
            workUnits,
            queueSummaries: deptSummaries?.summaries ?? [],
            // Canonical projection source: per-view counts come from these base rows + view predicates.
            baseRows: deptSummaries?.baseRows ?? undefined,
            // Derive Stage from status so Stage predicates (e.g. New Leads = stage "lead") evaluate.
            statusStageMap: statusStageMap ?? undefined,
        });
    }

    return enriched;
}

/**
 * Per-Work-View operational signals (attention/overdue) for the process tiles — generic,
 * from the operational projection's base rows + each view's predicates (no process-specific
 * logic). Fetched INDEPENDENTLY of the department queue-summaries so a slow/hung summaries
 * endpoint never hides them (they ride only the base-rows queue fetch, which is dedupe-cached
 * and shared with the projection). Cards without resolvable base rows are returned unchanged.
 */
async function fetchWorkViewOperationalSignalsForCards(
    cards: OperatorLifecycleLandingCard[],
    workUnits: OperatorLifecycleWorkUnitRow[],
    departments: OperatorLifecycleDepartmentRow[],
    init: RequestInit,
): Promise<OperatorLifecycleLandingCard[]> {
    const departmentIds = [...new Set(cards.map((c) => c.departmentId).filter(Boolean))];
    if (!departmentIds.length) return cards;

    const statusStageMap = await fetchOpportunityStatusStageMap(init);
    const departmentsById = new Map(departments.map((d) => [d.id, d] as const));
    const signalsByDepartment = new Map<string, Record<string, WorkViewOperationalSignals>>();

    await Promise.all(
        departmentIds.map(async (departmentId) => {
            const baseRows = await fetchPipelineBaseRowsForDepartment(departmentId, workUnits, init);
            if (!baseRows?.length) return;
            const workViews = savedWorkViewsFromDepartmentMetadata(departmentsById.get(departmentId)?.metadata);
            if (!workViews.length) return;
            signalsByDepartment.set(
                departmentId,
                computeWorkViewOperationalSignals({
                    baseRows,
                    workViews,
                    statusStageMap: statusStageMap ?? undefined,
                }),
            );
        }),
    );

    return applyWorkViewOperationalSignalsToCards(cards, signalsByDepartment);
}

export async function loadOperatorLifecycleLandingCards(options?: {
    force?: boolean;
    /** When false, skip department queue-summary rollups (metrics show —). */
    includeRollups?: boolean;
}): Promise<OperatorLifecycleLandingCard[]> {
    if (!options?.force && cachedCards) return cachedCards;
    if (!options?.force && inflight) return inflight;

    inflight = (async () => {
        const init = workspaceDataFetchInit() ?? { credentials: "include" as RequestCredentials };
        const [catalogRes, workUnitsRes, departmentsRes] = await Promise.all([
            dedupeAdminFetchWithTtl("/api/admin/lifecycle-catalog", init, LIFECYCLE_SIBLING_FETCH_TTL_MS),
            dedupeAdminFetchWithTtl("/api/admin/work-units", init, LIFECYCLE_SIBLING_FETCH_TTL_MS),
            dedupeAdminFetchWithTtl("/api/admin/departments", init, LIFECYCLE_SIBLING_FETCH_TTL_MS),
        ]);

        const catalogJson = (catalogRes.ok ? await catalogRes.json() : {}) as LifecycleCatalogResponse;
        const workUnitsJson = (workUnitsRes.ok ? await workUnitsRes.json() : {}) as WorkUnitsResponse;
        const departmentsJson = (departmentsRes.ok ? await departmentsRes.json() : {}) as DepartmentsResponse;
        const workUnits = workUnitsJson.items ?? [];
        const departments = (departmentsJson.items ?? []).map((row) => ({
            id: String((row as { id: string }).id),
            metadata: (row as { metadata?: unknown }).metadata,
        }));

        let cards = buildOperatorLifecycleLandingCards({
            catalogEntries: catalogJson.items ?? [],
            departments,
            workUnits,
        });

        if (options?.includeRollups !== false && cards.length) {
            const BUDGET_MS = 8_000;
            const withBudget = (work: Promise<OperatorLifecycleLandingCard[]>) =>
                Promise.race([
                    work,
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS)),
                ]).catch(() => null);

            // Per-view operational signals ride only the base-rows queue fetch — resolved FIRST
            // and independently so the tiles' attention/overdue context survives even when the
            // summaries endpoint below is slow or hung.
            const withSignals = await withBudget(
                fetchWorkViewOperationalSignalsForCards(cards, workUnits, departments, init),
            );
            if (withSignals) cards = withSignals;

            // Summary rollups (active/needs-attention counts + enrollment surface) are enrichment,
            // never a gate: sidebar/workspace NAV renders from the base cards, so a slow/hung
            // summaries endpoint must not wedge navigation. Bounded; on timeout the signal-enriched
            // cards above are preserved.
            const enriched = await withBudget(
                fetchLifecycleRollupsForCards(cards, workUnits, departments, init),
            );
            if (enriched) cards = enriched;
        }

        cachedCards = cards;
        return cards;
    })();

    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}
