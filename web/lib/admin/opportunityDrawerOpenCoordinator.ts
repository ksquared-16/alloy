import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { markOpportunityDrawerHydrateDone } from "@/lib/admin/opportunityDrawerHydrateGuards";
import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/** Minimum time to keep external "Opening record…" before mount (avoids flash of partial drawer). */
export const OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS = 1500;

export type OpportunityDrawerOpenPreload = {
    opportunityId: string;
    bootstrap: OpportunityDrawerOperationalBootstrapResponse;
    primaryEntity: Record<string, unknown>;
};

export function shouldDeferOpportunityDrawerOpen(
    pathname: string | null | undefined,
    entityId: string
): boolean {
    if (!adminV2DrawerBootstrapEnabled()) return false;
    const id = entityId.trim();
    if (!id || id === "new") return false;
    const p = pathname ?? "";
    return p.startsWith("/adminV2") || p.startsWith("/admin/workspace");
}

function opportunityPrimaryFetchUrl(opportunityId: string): string {
    return `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId)}?surface=drawer_primary`;
}

/**
 * Loads bootstrap + drawer_primary in parallel. Marks primary hydrate done on success.
 * Throws on network/contract failure — caller keeps external opening UI (no partial drawer).
 */
export async function loadOpportunityDrawerFirstPaint(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit
): Promise<OpportunityDrawerOpenPreload> {
    const id = opportunityId.trim();
    if (!id) throw new Error("missing_opportunity_id");

    const [bootstrap, primaryRes] = await Promise.all([
        fetchOpportunityDrawerOperationalBootstrap(id, workspaceContext ?? null, init),
        dedupeAdminFetch(opportunityPrimaryFetchUrl(id), init ?? workspaceDataFetchInit()),
    ]);

    if (!primaryRes.ok) {
        throw new Error(primaryRes.status === 404 ? "Not found" : "drawer_primary_failed");
    }

    const primaryEntity = (await primaryRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!primaryEntity || typeof primaryEntity !== "object") {
        throw new Error("drawer_primary_invalid");
    }
    if (String(primaryEntity.id ?? "").trim() !== id) {
        throw new Error("drawer_primary_id_mismatch");
    }

    if (!opportunityDrawerPrimaryContractReady(primaryEntity, id)) {
        throw new Error("drawer_primary_contract_not_ready");
    }

    markOpportunityDrawerHydrateDone(id, "primary");

    return {
        opportunityId: id,
        bootstrap,
        primaryEntity,
    };
}

export function raceOpportunityDrawerFirstPaintWithMinDelay(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit,
    minReadyMs: number = OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS
): Promise<OpportunityDrawerOpenPreload> {
    const loadP = loadOpportunityDrawerFirstPaint(opportunityId, workspaceContext, init);
    const minP = new Promise<void>((resolve) => {
        setTimeout(resolve, minReadyMs);
    });
    return Promise.all([loadP, minP]).then(([preload]) => preload);
}
