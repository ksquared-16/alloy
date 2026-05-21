import type { CommandSurfaceThreadTurn } from "./commandSurfaceThreadTypes";

const FORCE_SCROLL_TURN_KINDS = new Set<CommandSurfaceThreadTurn["kind"]>([
    "user_message",
    "action_card",
    "assistant_notice",
    "policy_denial",
    "error",
    "workflow_notice",
    "workflow_assist_read",
    "candidate_results",
    "target_confirmed",
    "task_clarification",
    "fuzzy_entity_suggestion",
]);

/** Whether the command surface should scroll to the latest turn (respects user scroll-up unless forced). */
export function shouldForceCommandSurfaceScrollToBottom(
    lastTurn: CommandSurfaceThreadTurn | undefined,
    userScrolledUp: boolean
): boolean {
    if (lastTurn && FORCE_SCROLL_TURN_KINDS.has(lastTurn.kind)) {
        return true;
    }
    return !userScrolledUp;
}
