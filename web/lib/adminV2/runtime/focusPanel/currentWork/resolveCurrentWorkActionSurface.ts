/**
 * Resolve how a Current Work action should execute when the operator clicks it.
 * Config-first, category-backed — no enrollment-specific branching.
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { isScheduleTourRegistryAction } from "@/lib/admin/actions/scheduleTourWorkUnitActions";

import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionSurface =
    | "inline_form"
    | "communications_composer"
    | "header_delegate"
    | "process_transition"
    | "unsupported";

function actionRegistryKey(action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef" | "resolved">): string {
    return (action.handlerKey ?? action.actionRef ?? action.key).trim();
}

/**
 * Known non-canonical registry keys that still execute through the Focus Panel
 * header → `applyRegistryResolvedActionClient` path by action key alone.
 */
const HEADER_DELEGATE_KNOWN_KEYS = new Set([
    "send_form",
    "create_task",
    "add_child",
    "add_family_member",
    "add_sibling",
    "send_email",
    "send_sms",
    "send_message",
    "call_parent",
    "upload_document",
    "schedule_tour",
    "reschedule_tour",
    "request_documents",
    "log_note",
    "add_note",
]);

function isProcessTransitionAction(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef" | "category"> &
        Partial<Pick<CurrentWorkActionVM, "placement">>,
): boolean {
    if (action.handlerKey === "process_stage_transition") return true;
    if (action.placement === "current_work_alternate_paths" && action.category === "alternate_path") {
        const key = actionRegistryKey(action);
        // Process transition refs and destination stage keys are not catalog actions.
        if (!key) return false;
        if (HEADER_DELEGATE_KNOWN_KEYS.has(key)) return false;
        if (canonicalActionDefinition(key)) return false;
        if (isScheduleTourRegistryAction({ key, payload: null })) return false;
        return true;
    }
    return false;
}

/**
 * Resolve how a Current Work action should execute when the operator clicks it.
 */
export function resolveCurrentWorkActionSurface(
    action: Pick<
        CurrentWorkActionVM,
        "key" | "handlerKey" | "category" | "actionRef" | "resolved"
    > &
        Partial<Pick<CurrentWorkActionVM, "placement">>,
): CurrentWorkActionSurface {
    const key = actionRegistryKey(action);
    if (!key || key === "mutation_command") return "unsupported";

    if (isProcessTransitionAction(action)) {
        return "process_transition";
    }

    if (isScheduleTourRegistryAction({ key, payload: action.resolved?.payload ?? null })) {
        return "inline_form";
    }

    const canonical = canonicalActionDefinition(key);
    if (canonical) {
        if (!canonical.runtimeWired) return "unsupported";

        if (canonical.category === "communication" || action.category === "communication") {
            return "communications_composer";
        }

        if (canonical.category === "bos_native") {
            return "unsupported";
        }

        if (
            canonical.category === "status_lifecycle"
            || canonical.category === "relationship"
            || canonical.executor.kind === "relationship_execute"
            || canonical.executor.kind === "dedicated_modal"
            || canonical.executor.kind === "admin_execute"
        ) {
            return "header_delegate";
        }

        return "header_delegate";
    }

    if (action.category === "communication") {
        return "communications_composer";
    }

    if (action.resolved || HEADER_DELEGATE_KNOWN_KEYS.has(key)) {
        return "header_delegate";
    }

    // Template helpful/primary refs resolve to execution keys without a resolved client
    // object — still run through the registry host by key (never silent no-op).
    if (
        action.category === "primary"
        || action.category === "supporting"
        || action.placement === "current_work_primary"
        || action.placement === "current_work_supporting"
    ) {
        return "header_delegate";
    }

    return "unsupported";
}
