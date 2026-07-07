/**
 * Queue Row Builder — operator-facing row focus (library context only).
 *
 * Row focus may filter or prioritize the library. It does not control slot layout.
 */

import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import type { ProcessStageOption } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";

export type QueueRowSubjectFocusUi = "family" | "child";

const WAITLIST_STAGE_PATTERN = /wait|waitlist|offer.?pending/i;

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

export function processHasWaitlistStages(stages: readonly ProcessStageOption[]): boolean {
    return stages.some((s) => WAITLIST_STAGE_PATTERN.test(s.value) || WAITLIST_STAGE_PATTERN.test(s.label ?? ""));
}

export function variantMatchesWaitlistStage(variant?: QueueRowVariant | null): boolean {
    const stages = variant?.appliesWhen?.stage_key ?? [];
    return stages.some((k) => WAITLIST_STAGE_PATTERN.test(k));
}

/**
 * Whether waitlist / placement fields should appear in the builder library.
 */
export function resolveQueueRowLibraryIsWaitlist(args: {
    libraryIsWaitlist?: boolean;
    activeVariant?: QueueRowVariant | null;
    processStages?: readonly ProcessStageOption[];
}): boolean {
    if (args.libraryIsWaitlist != null) return args.libraryIsWaitlist;
    if (args.activeVariant?.subjectFocus === "placement_candidate_child") return true;
    if (variantMatchesWaitlistStage(args.activeVariant)) return true;
    if (args.processStages && processHasWaitlistStages(args.processStages)) return true;
    return false;
}
