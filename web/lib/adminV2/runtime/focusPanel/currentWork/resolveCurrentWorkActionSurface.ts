/**
 * Resolve how a Current Work action should execute when the operator clicks it.
 * Fully metadata-driven — the host comes from capability metadata (declared interaction host,
 * category, placement) or the registry-resolved handler, never from an action name/label/stage/
 * process/intent.
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";

import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionSurface =
    | "inline_form"
    | "communications_composer"
    | "header_delegate"
    | "form_delivery"
    | "process_transition"
    | "subject_selector"
    | "unsupported";

function actionRegistryKey(action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef" | "resolved">): string {
    return (action.handlerKey ?? action.actionRef ?? action.key).trim();
}

function isProcessTransitionAction(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "actionRef" | "category"> &
        Partial<Pick<CurrentWorkActionVM, "placement">>,
): boolean {
    if (action.handlerKey === "process_stage_transition") return true;
    if (action.placement === "current_work_alternate_paths" && action.category === "alternate_path") {
        const key = actionRegistryKey(action);
        // Process-transition refs and destination stage keys are not catalog capabilities;
        // a registered capability (canonical) is never a raw transition.
        if (!key) return false;
        if (canonicalActionDefinition(key)) return false;
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
        Partial<Pick<CurrentWorkActionVM, "placement" | "relatedSubjectResolution" | "requiresSubjectPicker">>,
): CurrentWorkActionSurface {
    const key = actionRegistryKey(action);
    if (!key || key === "mutation_command") return "unsupported";

    if (isProcessTransitionAction(action)) {
        return "process_transition";
    }

    // Related-subject commands (e.g. Move to Waitlist → enrollment child) resolve through the
    // subject selector before execute — metadata on the VM, not the action name.
    if (
        action.relatedSubjectResolution === "enrollment_child"
        || action.requiresSubjectPicker === true
    ) {
        return "subject_selector";
    }

    const canonical = canonicalActionDefinition(key);
    if (canonical) {
        if (!canonical.runtimeWired) return "unsupported";

        // Capability-declared interaction host wins — metadata, never the action name.
        if (canonical.interactionHost) return canonical.interactionHost;

        if (canonical.category === "communication" || action.category === "communication") {
            return "communications_composer";
        }

        if (canonical.category === "bos_native") {
            return "unsupported";
        }

        // status_lifecycle / relationship / admin / dedicated executors delegate to the header host.
        return "header_delegate";
    }

    if (action.category === "communication") {
        return "communications_composer";
    }

    // Registry-resolved actions carry an executable handler — run them through the header host.
    if (action.resolved) {
        return "header_delegate";
    }

    // No capability resolved (not canonical, not registry-resolved, not a reserved handler /
    // transition / communication). An action with no resolvable capability must not present as
    // executable — return unsupported rather than a blind name/placement header fallback (no-op
    // prevention). Real template refs resolve to a canonical capability or a resolved handler above.
    return "unsupported";
}
