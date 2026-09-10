import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { isGenericUmbrellaLifecycleAction } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";

/**
 * Subject-local Manage menu — same registry-backed catalog as command rail `header_menu`.
 * Manage is a filtered presentation of operational actions for the active record.
 *
 * It said "filtered" and filtered nothing.
 *
 * `update_lead_status` and its siblings are runtime-internal umbrellas: the generic status mutation
 * that domain verbs (close_lead, waitlist_child, enroll_child) route through, carrying a
 * `target_state` the verb supplies. The platform action catalog marks them
 * `catalogVisibility: "internal_only"` and says in as many words that they are not
 * operator-selectable. Passed through verbatim, they rendered as ordinary menu items — and picking
 * one executed an umbrella with no verb behind it, so the operator got "target_state is required."
 * for an action that could never have worked.
 *
 * `classifyRecordHeaderActionsForCurrentWork` already drops them with this same predicate. Manage
 * now uses it too: one rule, both surfaces, no second list of keys to keep in sync.
 */
export function buildSubjectManageMenuFromResolvedActions(
    actions: ResolvedActionForClient[] | null | undefined,
): ResolvedActionForClient[] {
    if (!Array.isArray(actions)) return [];
    return actions.filter((action) => !isGenericUmbrellaLifecycleAction(action?.key ?? ""));
}

/** True when Manage should use registry actions instead of legacy entity admin stubs. */
export function subjectManageMenuUsesRegistryActions(
    actions: ResolvedActionForClient[] | null | undefined,
): boolean {
    return actions !== undefined;
}
