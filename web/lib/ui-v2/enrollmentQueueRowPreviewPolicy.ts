import type { QueueUiRowPreviewAction } from "@/lib/ui-v2/queueUiConfig";

/** Canonical enrollment queue row preview: Open only — Message/Ask BOS come from action placements. */
export const ENROLLMENT_QUEUE_ROW_PREVIEW_ACTIONS: QueueUiRowPreviewAction[] = ["open"];

/** Preview JSON must not author configurable actions; placements own these tokens. */
const PLACEMENT_AUTHORED_PREVIEW_TOKENS = new Set<QueueUiRowPreviewAction>([
    "message",
    "orchestrator",
    "update_status",
]);

const ENROLLMENT_STRIPPED_PREVIEW_TOKENS = new Set<QueueUiRowPreviewAction>([
    ...PLACEMENT_AUTHORED_PREVIEW_TOKENS,
    "call",
    "email",
]);

/**
 * Remove tokens that must be configured via `action_placements`, not queue preview JSON.
 */
export function stripPlacementAuthoredPreviewTokens(
    actions: QueueUiRowPreviewAction[]
): QueueUiRowPreviewAction[] {
    const out: QueueUiRowPreviewAction[] = [];
    const seen = new Set<string>();
    for (const a of actions) {
        if (PLACEMENT_AUTHORED_PREVIEW_TOKENS.has(a)) continue;
        if (seen.has(a)) continue;
        seen.add(a);
        out.push(a);
    }
    return out;
}

/**
 * Enrollment work-unit queues: strip Call/Email and placement-authored tokens; keep Open as safe default.
 */
export function normalizeEnrollmentQueueRowPreviewActions(
    actions: QueueUiRowPreviewAction[]
): QueueUiRowPreviewAction[] {
    const out: QueueUiRowPreviewAction[] = [];
    const seen = new Set<string>();
    for (const a of actions) {
        if (ENROLLMENT_STRIPPED_PREVIEW_TOKENS.has(a)) continue;
        if (seen.has(a)) continue;
        seen.add(a);
        out.push(a);
    }
    if (!out.includes("open")) out.unshift("open");
    return out;
}

export function resolveQueueRowPreviewActionsForWorkUnit(input: {
    actions: QueueUiRowPreviewAction[] | undefined;
    enrollmentLike: boolean;
}): QueueUiRowPreviewAction[] {
    const raw = input.actions?.length ? [...input.actions] : ["open"];
    const withoutPlacementAuthored = stripPlacementAuthoredPreviewTokens(raw);
    if (!input.enrollmentLike) {
        if (!withoutPlacementAuthored.includes("open")) {
            withoutPlacementAuthored.unshift("open");
        }
        return withoutPlacementAuthored.length ? withoutPlacementAuthored : ["open"];
    }
    return normalizeEnrollmentQueueRowPreviewActions(withoutPlacementAuthored);
}
