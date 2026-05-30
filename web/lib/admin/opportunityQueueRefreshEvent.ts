/**
 * Work-unit queue refresh signaling — `adminv2:opportunity-updated` detail contract.
 * Mutations that change queue-visible fields must dispatch with `id` + `action_key`.
 */

export const OPPORTUNITY_QUEUE_UPDATED_EVENT = "adminv2:opportunity-updated";

export type OpportunityQueueUpdatedDetail = {
    /** Opportunity row id — omit only for legacy broadcast (refreshes all listeners). */
    id?: string;
    action_key?: string;
};

/** Mutations that can change lane membership, sort order, or row labels/counts. */
const QUEUE_MEMBERSHIP_ACTION_KEYS = new Set([
    "inline_save",
    "patch_opportunity_quote",
    "schedule_tour",
    "tour_booking",
    "customer_member_inline_save",
    "inquiry_children_placement",
    "inquiry_child_placement_scope",
    "placement_manual_order",
    "person_contact_save",
    "household_primary_contact",
    "family_contacts_registry",
    "registry_action",
]);

export function dispatchOpportunityQueueUpdated(
    opportunityId: string,
    actionKey: string
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent(OPPORTUNITY_QUEUE_UPDATED_EVENT, {
            detail: { id, action_key: actionKey.trim() || "mutation" } satisfies OpportunityQueueUpdatedDetail,
        })
    );
}

/** Legacy broadcast — refreshes every work-unit listener (prefer {@link dispatchOpportunityQueueUpdated}). */
export function dispatchOpportunityQueueUpdatedBroadcast(actionKey = "broadcast"): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(OPPORTUNITY_QUEUE_UPDATED_EVENT, {
            detail: { action_key: actionKey } satisfies OpportunityQueueUpdatedDetail,
        })
    );
}

export function parseOpportunityQueueUpdatedDetail(ev: Event): OpportunityQueueUpdatedDetail | null {
    if (!(ev instanceof CustomEvent)) return null;
    const raw = ev.detail;
    if (raw == null) return {};
    if (typeof raw !== "object") return {};
    return raw as OpportunityQueueUpdatedDetail;
}

export function isQueueMembershipMutationActionKey(actionKey: string | undefined | null): boolean {
    const key = (actionKey ?? "").trim();
    if (!key) return true;
    if (QUEUE_MEMBERSHIP_ACTION_KEYS.has(key)) return true;
    if (key.startsWith("registry_")) return true;
    return false;
}

/**
 * Whether the current lane row fetch should run (summaries may still refresh separately).
 */
/** Person-only drawer edits should not force a full lane row refetch when the lead is off-screen. */
const PERSON_DRAWER_ONLY_QUEUE_ACTION_KEYS = new Set(["person_contact_save"]);

export function shouldRefetchWorkUnitQueueRowsForEvent(args: {
    detail: OpportunityQueueUpdatedDetail | null;
    visibleOpportunityIds: readonly string[];
}): boolean {
    const { detail, visibleOpportunityIds } = args;
    const actionKey = (detail?.action_key ?? "").trim();
    const oppId = (detail?.id ?? "").trim();
    if (!oppId) return true;
    if (PERSON_DRAWER_ONLY_QUEUE_ACTION_KEYS.has(actionKey) && !visibleOpportunityIds.includes(oppId)) {
        return false;
    }
    if (visibleOpportunityIds.includes(oppId)) return true;
    return isQueueMembershipMutationActionKey(actionKey);
}

const PERF_QUEUE_REFRESH_LOG =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.VITEST === "true");

/** Dev-only: log scoped queue refresh decisions from the work-unit listener. */
export function logWorkUnitQueueRefreshDecision(payload: {
    opportunityId?: string;
    actionKey?: string;
    refreshRows: boolean;
    refreshSummaries: boolean;
    visibleRowCount: number;
}): void {
    if (!PERF_QUEUE_REFRESH_LOG || typeof window === "undefined") return;
    console.info("[perf.queue.refresh]", payload);
}
