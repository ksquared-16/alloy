/**
 * Queue Row Builder — operator-facing subject focus (presentation only).
 *
 * Runtime may use candidate grain internally; the builder shows Family / Child only.
 */

import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";

export type QueueRowSubjectFocusUi = "family" | "child";

const WAITLIST_STAGE_PATTERN = /wait|offer.?pending/i;

export function subjectFocusToUi(focus?: QueueRowVariant["subjectFocus"] | null): QueueRowSubjectFocusUi {
    if (focus === "active_child" || focus === "placement_candidate_child") return "child";
    return "family";
}

/** Persist subject focus from operator UI — maps Child → candidate grain on waitlist stages. */
export function subjectFocusFromUi(
    ui: QueueRowSubjectFocusUi,
    stageKeys: readonly string[] = [],
): NonNullable<QueueRowVariant["subjectFocus"]> {
    if (ui === "family") return "household";
    const waitlistStages = stageKeys.some((k) => WAITLIST_STAGE_PATTERN.test(k));
    return waitlistStages ? "placement_candidate_child" : "active_child";
}

export function resolveQueueRowLibraryIsWaitlist(args: {
    libraryIsWaitlist?: boolean;
    activeVariant?: QueueRowVariant | null;
}): boolean {
    if (args.libraryIsWaitlist != null) return args.libraryIsWaitlist;
    const focus = args.activeVariant?.subjectFocus;
    if (focus === "placement_candidate_child") return true;
    const stages = args.activeVariant?.appliesWhen?.stage_key ?? [];
    if (subjectFocusToUi(focus) === "child" && stages.some((k) => WAITLIST_STAGE_PATTERN.test(k))) {
        return true;
    }
    return false;
}
