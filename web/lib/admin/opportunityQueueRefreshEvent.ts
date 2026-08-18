/**
 * Work-unit queue refresh signaling — `adminv2:opportunity-updated` detail contract.
 * Mutations that change queue-visible fields must dispatch with `id` + `action_key`.
 */

import type { OpportunityQueueRowDisplayPatch } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import { opportunityQueueRowDisplayPatchHasFields } from "@/lib/admin/opportunityQueueRowDisplayPatch";

export const OPPORTUNITY_QUEUE_UPDATED_EVENT = "adminv2:opportunity-updated";

export type OpportunityQueueUpdatedDetail = {
    /** Opportunity row id — omit only for legacy broadcast (refreshes all listeners). */
    id?: string;
    action_key?: string;
    /** Display-only mirrors for live queue row patch (Pass B). */
    queue_row_patch?: OpportunityQueueRowDisplayPatch;
};

/** Mutations that can change lane membership, sort order, or row labels/counts. */
const QUEUE_MEMBERSHIP_ACTION_KEYS = new Set([
    // Creating a lead adds a brand-new row to the New Leads lane — the work-unit listener must
    // refetch rows + counts (the new opportunity is never already in the visible list).
    "create_lead",
    "inline_save",
    "patch_opportunity_quote",
    "schedule_tour",
    "tour_booking",
    "customer_member_inline_save",
    "inquiry_child_placement_scope",
    "placement_manual_order",
    "household_primary_contact",
    "person_employee_updated",
    "family_contacts_registry",
    "registry_action",
    "delete_lead",
    // Stage-changing Current Work outcomes move membership + counts; Focus Panel stays open.
    "stage_work_outcome",
    // Child Enrollment waitlist moves candidate-grain Waitlist membership + case-grain Lead
    // re-evaluation. Event id is the family opportunity; Waitlist rows are child/candidate ids, so
    // membership classification is required for off-screen / cross-lane refetch + pill counts.
    "waitlist_child",
    "move_to_waitlist",
    // Records/Operations child mutations. Neither has an Opportunity subject, so both broadcast —
    // but both change what derived surfaces COUNT: `child.add` adds a durable child, and
    // `enrollment.start` creates a journey and its participant packet. Listed here so listeners
    // refetch rows AND counts rather than patching a row that may not be on screen at all.
    "child.add",
    "enrollment.start",
]);

/**
 * Display-only saves — patch visible row VM when `queue_row_patch` is present; avoid lane row refetch.
 */
const QUEUE_ROW_DISPLAY_PATCH_ACTION_KEYS = new Set([
    "person_record_updated",
    "person_contact_save",
    "inquiry_child_identity",
    "inquiry_children_placement",
]);

export function dispatchOpportunityQueueUpdated(
    opportunityId: string,
    actionKey: string,
    queueRowPatch?: OpportunityQueueRowDisplayPatch | null
): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    const detail: OpportunityQueueUpdatedDetail = {
        id,
        action_key: actionKey.trim() || "mutation",
    };
    if (queueRowPatch && opportunityQueueRowDisplayPatchHasFields(queueRowPatch)) {
        detail.queue_row_patch = queueRowPatch;
    }
    window.dispatchEvent(
        new CustomEvent(OPPORTUNITY_QUEUE_UPDATED_EVENT, {
            detail,
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

export function isQueueRowDisplayPatchActionKey(actionKey: string | undefined | null): boolean {
    const key = (actionKey ?? "").trim();
    return QUEUE_ROW_DISPLAY_PATCH_ACTION_KEYS.has(key);
}

/**
 * Patch visible queue row in place — no lane refetch, no row-cache delete.
 */
export function shouldPatchWorkUnitQueueRowsForEvent(args: {
    detail: OpportunityQueueUpdatedDetail | null;
    visibleOpportunityIds: readonly string[];
}): boolean {
    const { detail, visibleOpportunityIds } = args;
    const oppId = (detail?.id ?? "").trim();
    if (!oppId) return false;
    if (!visibleOpportunityIds.includes(oppId)) return false;
    const actionKey = (detail?.action_key ?? "").trim();
    if (!isQueueRowDisplayPatchActionKey(actionKey)) return false;
    return opportunityQueueRowDisplayPatchHasFields(detail?.queue_row_patch);
}

/** Person-only drawer edits should not force a full lane row refetch when the lead is off-screen. */
const PERSON_DRAWER_ONLY_QUEUE_ACTION_KEYS = new Set(["person_contact_save", "person_record_updated"]);

export function shouldRefetchWorkUnitQueueRowsForEvent(args: {
    detail: OpportunityQueueUpdatedDetail | null;
    visibleOpportunityIds: readonly string[];
}): boolean {
    const { detail, visibleOpportunityIds } = args;
    if (shouldPatchWorkUnitQueueRowsForEvent(args)) return false;

    const actionKey = (detail?.action_key ?? "").trim();
    const oppId = (detail?.id ?? "").trim();
    if (!oppId) return true;
    if (PERSON_DRAWER_ONLY_QUEUE_ACTION_KEYS.has(actionKey) && !visibleOpportunityIds.includes(oppId)) {
        return false;
    }
    if (visibleOpportunityIds.includes(oppId)) {
        if (
            isQueueRowDisplayPatchActionKey(actionKey) &&
            !opportunityQueueRowDisplayPatchHasFields(detail?.queue_row_patch)
        ) {
            return true;
        }
        return !isQueueRowDisplayPatchActionKey(actionKey);
    }
    return isQueueMembershipMutationActionKey(actionKey);
}

/** Summaries may refresh in background; skip when display-only patch handles visible row. */
export function shouldRefreshQueueSummariesForEvent(args: {
    detail: OpportunityQueueUpdatedDetail | null;
    visibleOpportunityIds: readonly string[];
}): boolean {
    if (shouldPatchWorkUnitQueueRowsForEvent(args)) return false;
    const oppId = (args.detail?.id ?? "").trim();
    const actionKey = (args.detail?.action_key ?? "").trim();
    if (
        oppId &&
        PERSON_DRAWER_ONLY_QUEUE_ACTION_KEYS.has(actionKey) &&
        !args.visibleOpportunityIds.includes(oppId)
    ) {
        return false;
    }
    return true;
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
    patchedRows?: boolean;
    visibleRowCount: number;
}): void {
    if (!PERF_QUEUE_REFRESH_LOG || typeof window === "undefined") return;
    console.info("[perf.queue.refresh]", payload);
}
