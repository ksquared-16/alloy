import {
    dispatchOpportunityQueueUpdated,
    type OpportunityQueueUpdatedDetail,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

export const ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH = "adminv2:opportunity-drawer-record-patch" as const;

export type OpportunityDrawerRecordPatchDetail = {
    opportunity_id: string;
    record: Record<string, unknown>;
};

export type OpportunityDrawerRefreshScope =
    | "operational_tasks"
    | "tour_surfaces"
    | "activity"
    | "documents"
    | "header_actions";

const TOUR_SURFACE_ACTION_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "tour_booking",
    "record_tour_outcome",
    "confirm_tour",
]);

export function parseOpportunityDrawerRecordPatchDetail(ev: Event): OpportunityDrawerRecordPatchDetail | null {
    if (!(ev instanceof CustomEvent)) return null;
    const raw = ev.detail;
    if (!raw || typeof raw !== "object") return null;
    const opportunityId =
        typeof (raw as OpportunityDrawerRecordPatchDetail).opportunity_id === "string"
            ? (raw as OpportunityDrawerRecordPatchDetail).opportunity_id.trim()
            : "";
    const record = (raw as OpportunityDrawerRecordPatchDetail).record;
    if (!opportunityId || !record || typeof record !== "object" || Array.isArray(record)) return null;
    return { opportunity_id: opportunityId, record };
}

/** In-place VM / legacy drawer record merge — avoids full drawer reload. */
export function dispatchOpportunityDrawerRecordPatch(
    opportunityId: string,
    record: Record<string, unknown>
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent<OpportunityDrawerRecordPatchDetail>(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, {
            detail: { opportunity_id: id, record },
        })
    );
}

export function dispatchOpportunityDrawerOperationalTasksRefresh(opportunityId: string): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
            detail: { opportunity_id: id },
        })
    );
}

export function isTourSurfaceActionKey(actionKey: string | undefined | null): boolean {
    const key = (actionKey ?? "").trim();
    return TOUR_SURFACE_ACTION_KEYS.has(key);
}

/** Scoped queue + section listeners — no admin-entity-saved / full drawer reload. */
export function dispatchOpportunityDrawerScopedUpdate(
    opportunityId: string,
    actionKey: string,
    scopes: readonly OpportunityDrawerRefreshScope[] = ["activity"]
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    const key = actionKey.trim() || "mutation";
    if (!id) return;

    if (scopes.includes("operational_tasks")) {
        dispatchOpportunityDrawerOperationalTasksRefresh(id);
    }

    const queueDetail: OpportunityQueueUpdatedDetail = { id, action_key: key };
    if (scopes.includes("tour_surfaces") || scopes.includes("header_actions") || scopes.includes("activity")) {
        dispatchOpportunityQueueUpdated(id, key);
        return;
    }

    if (scopes.includes("documents")) {
        window.dispatchEvent(new CustomEvent("adminv2:opportunity-updated", { detail: queueDetail }));
    }
}
