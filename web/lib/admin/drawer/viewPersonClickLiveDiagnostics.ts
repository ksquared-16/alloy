import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** Dev-only — visible attrs + console log for View Person live smoke. */
export const VIEW_PERSON_LIVE_DIAG_ENABLED =
    process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export type ViewPersonClickLivePayload = {
    personId: string | null;
    opportunityId: string | null;
    targetType: AdminDrawerEntityType | null;
    targetId: string | null;
    openCalled: boolean;
    currentDrawerType: AdminDrawerEntityType | null;
    currentDrawerId: string | null;
    stackDepth: number;
};

export function logViewPersonClickLive(payload: ViewPersonClickLivePayload): void {
    if (!VIEW_PERSON_LIVE_DIAG_ENABLED) return;
    console.info("[view-person-click-live]", payload);
}

export function viewPersonLiveDiagAttrs(params: {
    personId: string;
    clickFired?: boolean;
    openCalled?: boolean;
}): Record<string, string> {
    if (!VIEW_PERSON_LIVE_DIAG_ENABLED) return {};
    return {
        "data-view-person-target-id": params.personId,
        ...(params.clickFired ? { "data-view-person-clicked": "true" } : {}),
        ...(params.openCalled ? { "data-view-person-open-called": "true" } : {}),
    };
}
