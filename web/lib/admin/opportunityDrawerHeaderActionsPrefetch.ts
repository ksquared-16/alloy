import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const HEADER_ACTIONS_CACHE_TTL_MS = 8_000;

type HeaderActionsCacheEntry = {
    promise: Promise<ResolvedActionsBySlot>;
};

const headerActionsBySig = new Map<string, HeaderActionsCacheEntry>();

function appendOpportunityRecordHeaderHints(
    qs: URLSearchParams,
    data: Record<string, unknown> | null | undefined,
    drawerId: string
): void {
    if (!data || typeof data !== "object") return;
    if (String((data as { id?: unknown }).id ?? "").trim() !== String(drawerId).trim()) return;
    const sk = (data as { status_key?: unknown }).status_key;
    if (typeof sk === "string" && sk.trim()) qs.set("hint_opportunity_status_key", sk.trim());
    const meta = (data as { metadata?: unknown }).metadata;
    if (meta && typeof meta === "object") {
        try {
            qs.set("hint_opportunity_metadata", JSON.stringify(meta));
        } catch {
            /* ignore */
        }
    }
}

export function buildOpportunityDrawerHeaderActionsUrlFromRecord(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entity: Record<string, unknown>
): string | null {
    const id = opportunityId.trim();
    const ctxWu = (workspaceContext?.work_unit_id ?? "").trim();
    const ctxDept = (workspaceContext?.department_id ?? "").trim();
    const dataWu = String((entity.work_unit_id as unknown) ?? "").trim();
    const deptFromRecord = String((entity._work_unit_department_id as unknown) ?? "").trim();
    const workUnitId = ctxWu || dataWu;
    const departmentId = ctxDept || deptFromRecord;
    if (!workUnitId || !departmentId) return null;

    const qs = new URLSearchParams({
        surface: "record_header",
        entity_type: "opportunity",
        entity_id: id,
    });
    qs.set("work_unit_id", workUnitId);
    qs.set("department_id", departmentId);
    appendOpportunityRecordHeaderHints(qs, entity, id);
    return `/api/admin/actions?${qs.toString()}`;
}

export function buildOpportunityDrawerHeaderActionsUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entity: Record<string, unknown>,
    bootstrap: OpportunityDrawerOperationalBootstrapResponse
): string | null {
    const id = opportunityId.trim();
    const ctxWu = (workspaceContext?.work_unit_id ?? "").trim();
    const ctxDept = (workspaceContext?.department_id ?? "").trim();
    const dataWu = String((entity.work_unit_id as unknown) ?? "").trim();
    const deptFromRecord = String((entity._work_unit_department_id as unknown) ?? "").trim();
    const workUnitId = ctxWu || dataWu || (bootstrap.work_unit?.id ?? "").trim();
    const departmentId =
        ctxDept || deptFromRecord || (bootstrap.work_unit?.department_id ?? bootstrap.workspace_scope.department_id ?? "").trim();
    if (!workUnitId || !departmentId) return null;

    const qs = new URLSearchParams({
        surface: "record_header",
        entity_type: "opportunity",
        entity_id: id,
    });
    qs.set("work_unit_id", workUnitId);
    qs.set("department_id", departmentId);
    appendOpportunityRecordHeaderHints(qs, entity, id);
    return `/api/admin/actions?${qs.toString()}`;
}

export async function fetchOpportunityDrawerHeaderActionsFromRecord(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entity: Record<string, unknown>,
    init?: RequestInit
): Promise<ResolvedActionsBySlot> {
    const url = buildOpportunityDrawerHeaderActionsUrlFromRecord(opportunityId, workspaceContext, entity);
    if (!url) return emptyResolvedActionsBySlot();

    return dedupeAdminFetchWithTtl(url, init ?? workspaceDataFetchInit(), HEADER_ACTIONS_CACHE_TTL_MS)
        .then((r) => r.json())
        .then((j: { actions?: ResolvedActionsBySlot }) => j.actions ?? emptyResolvedActionsBySlot())
        .catch(() => emptyResolvedActionsBySlot());
}

export function isOpportunityDrawerHeaderActionsWarm(actionsUrl: string | null): boolean {
    if (!actionsUrl) return false;
    return headerActionsBySig.has(actionsUrl);
}

export async function fetchOpportunityDrawerHeaderActions(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entity: Record<string, unknown>,
    bootstrap: OpportunityDrawerOperationalBootstrapResponse,
    init?: RequestInit
): Promise<ResolvedActionsBySlot> {
    const bundled = bootstrap.record_header_actions;
    if (bundled != null && typeof bundled === "object") {
        return bundled;
    }

    const url = buildOpportunityDrawerHeaderActionsUrl(opportunityId, workspaceContext, entity, bootstrap);
    if (!url) return emptyResolvedActionsBySlot();

    const cached = headerActionsBySig.get(url);
    if (cached) return cached.promise;

    const promise = dedupeAdminFetchWithTtl(url, init ?? workspaceDataFetchInit(), HEADER_ACTIONS_CACHE_TTL_MS)
        .then((r) => r.json())
        .then((j: { actions?: ResolvedActionsBySlot }) => j.actions ?? emptyResolvedActionsBySlot())
        .catch(() => emptyResolvedActionsBySlot());

    headerActionsBySig.set(url, { promise });
    void promise.finally(() => {
        setTimeout(() => {
            if (headerActionsBySig.get(url)?.promise === promise) {
                headerActionsBySig.delete(url);
            }
        }, HEADER_ACTIONS_CACHE_TTL_MS);
    });

    return promise;
}

/** Intent/coordinator — fire-and-forget when primary + bootstrap are not yet available. */
export function prefetchOpportunityDrawerHeaderActions(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entity: Record<string, unknown>,
    bootstrap: OpportunityDrawerOperationalBootstrapResponse,
    init?: RequestInit
): void {
    void fetchOpportunityDrawerHeaderActions(opportunityId, workspaceContext, entity, bootstrap, init).catch(() => {
        /* non-fatal */
    });
}
