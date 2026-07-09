import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { isScheduleTourRegistryAction } from "@/lib/admin/actions/scheduleTourWorkUnitActions";

import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionSurface =
    | "inline_form"
    | "communications_composer"
    | "header_delegate"
    | "unsupported";

function actionRegistryKey(action: Pick<CurrentWorkActionVM, "key" | "actionRef" | "resolved">): string {
    return (action.actionRef ?? action.key).trim();
}

/**
 * Resolve how a Current Work action should execute when the operator clicks it.
 * Config-first, category-backed — no enrollment-specific branching.
 */
export function resolveCurrentWorkActionSurface(
    action: Pick<CurrentWorkActionVM, "key" | "handlerKey" | "category" | "actionRef" | "resolved">,
): CurrentWorkActionSurface {
    const key = actionRegistryKey(action);
    if (!key) return "unsupported";

    if (isScheduleTourRegistryAction({ key, payload: action.resolved?.payload ?? null })) {
        return "inline_form";
    }

    const canonical = canonicalActionDefinition(key);
    if (!canonical) {
        return action.resolved ? "header_delegate" : "unsupported";
    }

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
    ) {
        return "header_delegate";
    }

    if (action.resolved) {
        return "header_delegate";
    }

    return "unsupported";
}
