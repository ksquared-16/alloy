import {
    adminV2DrawerBootstrapEnabled,
    fetchOpportunityDrawerOperationalBootstrap,
} from "@/lib/admin/opportunityDrawerBootstrapClient";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { warmQueueRowOpportunityVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { prefetchOpportunityDrawerFull } from "@/lib/admin/opportunityDrawerFullPrefetch";
import { prefetchOpportunityDrawerPrimary } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { warmVisibleQueueRowOpportunityVms } from "@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";

export type OpportunityDrawerIntentContext = {
    work_unit_id: string;
    department_id: string;
};

/**
 * Hover/focus intent — bootstrap + drawer_primary only.
 * Full hydrate is deferred to pointer-down so hover does not compete with active lane DB work.
 */
export function prefetchOpportunityDrawerOnRowIntent(
    opportunityId: string,
    workspaceContext?: OpportunityDrawerIntentContext | null,
    _queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;
    if (opportunityDrawerHardCutoverEnabled()) {
        warmQueueRowOpportunityVm(id, workspaceContext ?? null, "queue_row_intent");
        return;
    }
    prefetchOpportunityDrawerPrimaryLaneOnRowIntent(id, workspaceContext, _queuePreviewSeed);
}

/** Bootstrap + drawer_primary — safe on hover/focus without full-hydrate cost. */
export function prefetchOpportunityDrawerPrimaryLaneOnRowIntent(
    opportunityId: string,
    workspaceContext?: OpportunityDrawerIntentContext | null,
    _queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;
    if (opportunityDrawerHardCutoverEnabled()) return;

    logPrefetchAdminV2("drawer_primary", "start", {
        record_id: id,
        reason: "queue_row_intent",
        work_unit_id: workspaceContext?.work_unit_id ?? null,
    });

    const init = workspaceDataFetchInit();

    if (!adminV2DrawerBootstrapEnabled()) {
        const url = `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=drawer_visible`;
        void dedupeAdminFetch(url, init).catch(() => {
            /* non-fatal — drawer open will retry */
        });
        return;
    }

    void fetchOpportunityDrawerOperationalBootstrap(id, workspaceContext ?? null, init).catch(() => {
        /* non-fatal — drawer open will reuse in-flight or retry */
    });
    prefetchOpportunityDrawerPrimary(id, init, workspaceContext ?? null, _queuePreviewSeed ?? null);
}

/** Pointer-down intent — warm surface=full without blocking active queue lane work on hover. */
export function prefetchOpportunityDrawerFullOnRowIntent(
    opportunityId: string,
    init?: RequestInit,
    workspaceContext?: OpportunityDrawerIntentContext | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;
    if (opportunityDrawerHardCutoverEnabled()) {
        warmQueueRowOpportunityVm(id, workspaceContext ?? null, "queue_row_pointer_down");
        return;
    }
    prefetchOpportunityDrawerFull(id, init ?? workspaceDataFetchInit());
}

const VISIBLE_DRAWER_PREFETCH_CAP = 3;

/** After WU reveal — warm drawer_primary for first visible opportunity rows only. */
export function prefetchVisibleWorkUnitDrawerPrimary(
    opportunityIds: string[],
    workspaceContext?: OpportunityDrawerIntentContext | null
): void {
    const unique = [...new Set(opportunityIds.map((id) => id.trim()).filter(Boolean))].slice(
        0,
        VISIBLE_DRAWER_PREFETCH_CAP
    );
    if (!unique.length) {
        logPrefetchAdminV2("drawer_primary", "skipped", { reason: "no_visible_row_ids" });
        return;
    }
    logPrefetchAdminV2("drawer_primary", "start", {
        reason: "wu_idle_visible_rows",
        record_ids: unique,
        cap: VISIBLE_DRAWER_PREFETCH_CAP,
    });
    for (const id of unique) {
        prefetchOpportunityDrawerOnRowIntent(id, workspaceContext ?? undefined);
    }
    warmVisibleQueueRowOpportunityVms(unique, workspaceContext ?? undefined);
}
