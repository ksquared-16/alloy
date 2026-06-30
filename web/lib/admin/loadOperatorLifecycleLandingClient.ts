import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    buildOperatorLifecycleLandingCards,
    type OperatorLifecycleDepartmentRow,
    type OperatorLifecycleLandingCard,
    type OperatorLifecycleWorkUnitRow,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    applyOperatorLifecycleLandingRollups,
    resolveLifecycleRollupsFromDepartmentSummaries,
    type LifecycleDepartmentSummariesResponse,
} from "@/lib/admin/resolveOperatorLifecycleLandingRollups";
import {
    enrichEnrollmentOperationalSurfaceForDepartment,
    enrollmentOperationalSurfaceNeedsHydration,
} from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetchWithTtl, LIFECYCLE_SIBLING_FETCH_TTL_MS } from "@/lib/workspace/workspaceAdminFetchDedupe";

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

async function fetchLifecycleRollupsForCards(
    cards: OperatorLifecycleLandingCard[],
    workUnits: OperatorLifecycleWorkUnitRow[],
    departments: OperatorLifecycleDepartmentRow[],
    init: RequestInit,
): Promise<OperatorLifecycleLandingCard[]> {
    const departmentIds = [...new Set(cards.map((c) => c.departmentId).filter(Boolean))];
    if (!departmentIds.length) return cards;

    const summariesByDept = await Promise.all(
        departmentIds.map(async (departmentId) => {
            const res = await dedupeAdminFetchWithTtl(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5`,
                init,
                LIFECYCLE_SIBLING_FETCH_TTL_MS,
            );
            const json = (res.ok ? await res.json() : {}) as LifecycleDepartmentSummariesResponse;
            return { departmentId, summaries: json.work_units ?? [] };
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
        });
    }

    return enriched;
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
            try {
                cards = await fetchLifecycleRollupsForCards(cards, workUnits, departments, init);
            } catch {
                // Rollups are optional — cards still render with null metric fallbacks.
            }
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
