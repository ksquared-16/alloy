/**
 * Child Process Stage label — the operator-facing replacement for the retired per-child
 * "Participation Status." A child's Process Stage is sourced, in order:
 *   1. the child's own stage_key (process_instances.stage_key) when present,
 *   2. else the stage-equivalent enrollment disposition (OCM outcome_status_key / PI state — the
 *      same vocabulary) mapped to its child stage,
 *   3. else the family/opportunity stage it's riding (brand-new lead with no child stage yet).
 *
 * This is presentation-only: it never mutates. It exists so every surface can show Process Stage
 * without losing information while the disposition data is retired to internal compatibility.
 */

import { ENROLLMENT_STAGE_SPECS } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

const STAGE_LABEL_BY_KEY: ReadonlyMap<string, string> = new Map(
    ENROLLMENT_STAGE_SPECS.map((s) => [s.key, s.label]),
);

/**
 * Enrollment disposition / PI-state key → child Process Stage key. The disposition vocabulary
 * (waitlisted/enrolling/enrolled/withdrawn/not_enrolling + legacy aliases) is the SAME set the
 * process instance carries as `state`, so this is a faithful stage mapping, not a guess.
 */
const DISPOSITION_TO_STAGE_KEY: Readonly<Record<string, string>> = {
    waitlisted: "waitlist",
    offer_pending: "waitlist",
    enrolling: "enrolling",
    future_start: "enrolling",
    enrolled: "enrolled",
    withdrawn: "closed_withdrawn",
    not_enrolling: "closed_withdrawn",
    declined: "closed_withdrawn",
    closed: "closed_withdrawn",
    // Undispositioned / brand-new lead → the family Lead stage.
    new_inquiry: "lead",
    new_lead: "lead",
    new: "lead",
    open: "lead",
};

function labelForStageKey(key: string | null | undefined): string | null {
    const k = key?.trim();
    return k && STAGE_LABEL_BY_KEY.has(k) ? (STAGE_LABEL_BY_KEY.get(k) as string) : null;
}

/**
 * THE CHILD'S STABLE PROCESS STAGE KEY — the same resolution the label uses, stopping one step
 * earlier.
 *
 * Placement on a rail must never be decided by a display string. "Waitlisted" and "Waitlist" are
 * different vocabularies, and matching them would mean stripping suffixes until two words agree —
 * which silently drops a marker the day a label is reworded. This returns the identity instead.
 *
 * It shares {@link resolveChildProcessStageLabel}'s chain deliberately: a child whose stage is known
 * only through its disposition has a real, placeable stage, and resolving the key from a narrower
 * source than the label would leave that child labelled but unplaceable — visible in one surface and
 * missing from another, for the same underlying fact.
 *
 * Null means genuinely unknown, and is an ANSWER: the caller records an unresolved participant
 * rather than guessing a stage for them.
 */
export function resolveChildProcessStageKey(args: {
    stageKey?: string | null;
    dispositionKey?: string | null;
    familyStageKey?: string | null;
}): string | null {
    const own = args.stageKey?.trim();
    if (own && STAGE_LABEL_BY_KEY.has(own)) return own;

    const disposition = args.dispositionKey?.trim().toLowerCase();
    if (disposition) {
        const mapped = DISPOSITION_TO_STAGE_KEY[disposition];
        if (mapped && STAGE_LABEL_BY_KEY.has(mapped)) return mapped;
    }

    const family = args.familyStageKey?.trim();
    return family && STAGE_LABEL_BY_KEY.has(family) ? family : null;
}

/**
 * The child's Process Stage label. Returns null only when nothing is known (caller suppresses the
 * badge — a brand-new lead with no stage yet). Prefers the true stage; the disposition mapping is a
 * compatibility bridge until every surface reads `stage_key` directly.
 */
export function resolveChildProcessStageLabel(args: {
    stageKey?: string | null;
    dispositionKey?: string | null;
    familyStageKey?: string | null;
}): string | null {
    const fromStage = labelForStageKey(args.stageKey);
    if (fromStage) return fromStage;

    const disposition = args.dispositionKey?.trim().toLowerCase();
    if (disposition) {
        const fromDisposition = labelForStageKey(DISPOSITION_TO_STAGE_KEY[disposition]);
        if (fromDisposition) return fromDisposition;
    }

    return labelForStageKey(args.familyStageKey);
}
