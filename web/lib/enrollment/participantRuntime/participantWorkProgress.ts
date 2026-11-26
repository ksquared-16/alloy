/**
 * How much of THEIR OWN work a participant has finished.
 *
 * Enrollment already has a progress projection, and it is the wrong denominator to show a parent:
 * `progress.total_requirements` counts BP requirements, which legitimately include unrealized and
 * unsupported items. A percentage over it moves for reasons the parent cannot see.
 *
 * The denominator a parent CAN see is the one the conversation is made of — unique semantic facts.
 * That set is already deduped by canonical key upstream (Slice 2.4), which is precisely why a
 * document with fifteen date-of-birth destinations cannot inflate it, and why the number cannot go
 * backwards when a second artifact re-renders a fact the parent already settled.
 *
 * Pure. No I/O, no clock, no provider.
 */

import type {
    EnrollmentInformationNeed,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantPhase } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

export type ParticipantWorkProgress = {
    /** Units of participant work in this objective — semantic facts, plus the paperwork itself. */
    readonly total: number;
    /** Units that no longer need the participant. */
    readonly settled: number;
    readonly remaining: number;
    /** 0-100, and never 100 while anything remains. */
    readonly percent: number;
};

/**
 * The paperwork counts as ONE unit, not one per signature.
 *
 * A parent experiences "review and sign the paperwork" as a single activity; counting each
 * artifact-specific occurrence would make the number lurch when a document happens to carry three
 * signature boxes, which is a fact about the PDF and not about their work.
 */
function artifactUnits(needs: readonly EnrollmentInformationNeed[], phase: ParticipantPhase): number {
    if (needs.some((n) => n.state === "artifact_specific")) return 1;
    // A journey that reaches review without an artifact-specific need still has a review to do.
    return phase === "artifact_review" ? 1 : 0;
}

export function projectParticipantWorkProgress(input: {
    readonly needs: readonly EnrollmentInformationNeed[];
    readonly phase: ParticipantPhase;
}): ParticipantWorkProgress {
    // One unit per unique semantic fact. `artifact_specific` needs are excluded here and folded
    // into the single paperwork unit below, so a signature is never counted twice.
    const semantic = input.needs.filter((n) => n.state !== "artifact_specific");
    /**
     * OPTIONALITY DECIDES BLOCKING, NOT COUNTING.
     *
     * `requires_participant_action` is already false for an optional missing fact, which is exactly
     * the rule this needs: a parent with nothing to add about allergies is not being held up by it,
     * so it must not sit in the remainder forever.
     */
    const semanticSettled = semantic.filter((n) => !n.requires_participant_action).length;

    const artifact = artifactUnits(input.needs, input.phase);
    const artifactSettled = input.phase === "complete" ? artifact : 0;

    const total = semantic.length + artifact;
    const settled = Math.min(total, semanticSettled + artifactSettled);
    const remaining = Math.max(0, total - settled);

    if (total === 0) {
        return { total: 0, settled: 0, remaining: 0, percent: input.phase === "complete" ? 100 : 0 };
    }

    const raw = Math.round((settled / total) * 100);
    // A parent who reads 100% and is then asked another question has been lied to. Reserve the
    // number for an actually-finished objective, and never show 0% for work already done.
    const percent = remaining === 0 ? 100 : Math.min(99, Math.max(settled > 0 ? 1 : 0, raw));

    return { total, settled, remaining, percent };
}
