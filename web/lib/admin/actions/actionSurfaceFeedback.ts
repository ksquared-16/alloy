/**
 * Card 5 — Action surface coherence (presentation only).
 * Normalizes operator-facing feedback and opportunity refresh signals; no execute semantics.
 */

import type { ApplyRegistryResolvedActionResult } from "@/lib/admin/actions/applyRegistryResolvedActionResult";

/** Read-only runtime executor labels for Settings inventory and docs. */
export type ActionRuntimeExecutor =
    | "registry_execute"
    | "registry_ui_intent"
    | "registry_navigate"
    | "registry_open_drawer"
    | "registry_open_form"
    | "legacy_record_action_patch"
    | "hardcoded"
    | "dedicated_modal"
    | "unknown";

const CLIENT_ONLY_REGISTRY_ACTION_TYPES = new Set([
    "navigate",
    "external_link",
    "open_drawer",
    "ui_intent",
    "open_form",
]);

export const ACTION_SURFACE_INLINE_ERROR_CLASS =
    "rounded-md border border-alloy-ember/25 bg-alloy-ember/5 px-2.5 py-1.5 text-xs text-alloy-ember";

export function classifyRegistryDefinitionExecutor(actionType: string): ActionRuntimeExecutor {
    const t = actionType.trim();
    if (t === "ui_intent") return "registry_ui_intent";
    if (t === "navigate" || t === "external_link") return "registry_navigate";
    if (t === "open_drawer") return "registry_open_drawer";
    if (t === "open_form") return "registry_open_form";
    if (!t) return "unknown";
    return "registry_execute";
}

export function registryExecutorLabel(executor: ActionRuntimeExecutor): string {
    switch (executor) {
        case "registry_execute":
            return "Registry execute";
        case "registry_ui_intent":
            return "Registry placeholder";
        case "registry_navigate":
            return "Registry link";
        case "registry_open_drawer":
            return "Registry open drawer";
        case "registry_open_form":
            return "Registry form modal";
        case "legacy_record_action_patch":
            return "Legacy record_actions PATCH";
        case "hardcoded":
            return "Hardcoded UI";
        case "dedicated_modal":
            return "Dedicated modal / flow";
        default:
            return "Unknown";
    }
}

export function isRegistryMutatingActionType(actionType: string): boolean {
    return !CLIENT_ONLY_REGISTRY_ACTION_TYPES.has(actionType.trim());
}

export function formatRegistryActionFailure(error?: string): string {
    const msg = error?.trim();
    if (msg) return msg;
    return "This action could not be completed. Try again or open the record in the drawer.";
}

export function formatLegacyRecordActionFailure(eventKey: string, error?: string): string {
    const msg = error?.trim();
    const key = eventKey.trim() || "action";
    if (msg) return `${msg} (${key})`;
    return `This action could not be completed (${key}).`;
}

export function dispatchOpportunityRecordUpdated(opportunityId: string, actionKey: string): void {
    if (typeof window === "undefined") return;
    const id = opportunityId.trim();
    if (!id) return;
    window.dispatchEvent(
        new CustomEvent("adminv2:opportunity-updated", {
            detail: { id, action_key: actionKey.trim() || "registry_action" },
        })
    );
}

export function shouldNotifyOpportunityRecordUpdated(actionType: string, result: ApplyRegistryResolvedActionResult): boolean {
    if (!result.ok) return false;
    return isRegistryMutatingActionType(actionType);
}

/** After a registry section/queue click: user error text and whether header refresh was signaled. */
export function handleRegistrySectionActionOutcome(
    opportunityId: string,
    action: { key: string; action_type: string },
    result: ApplyRegistryResolvedActionResult
): { error: string | null; notified: boolean } {
    if (!result.ok) {
        return { error: formatRegistryActionFailure(result.error), notified: false };
    }
    if (shouldNotifyOpportunityRecordUpdated(action.action_type, result)) {
        dispatchOpportunityRecordUpdated(opportunityId, action.key);
        return { error: null, notified: true };
    }
    return { error: null, notified: false };
}
