import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import type { BpResolvedEnrollmentDestination } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import type {
    RequirementValidationResult,
    RequirementViolation,
} from "@/lib/completion/requirementValidationTypes";

/**
 * Artifacts produced by the skipped-stage / tour bypass prompt — never the
 * field-based intake requirements (Program / Schedule / Start Date), which
 * remain config-driven hard blocks.
 */
function isSkippedStageBypassViolation(violation: RequirementViolation): boolean {
    const key = violation.field_key?.trim() ?? "";
    return key === "bypass_reason" || key.startsWith("skipped_stage_");
}

/**
 * True when a documented bypass reason accompanies a parking-lot waitlist jump.
 *
 * Used ONLY to waive the skipped-stage / tour bypass prompt. It must never be
 * used to clear field-based requirement blocks — those stay governed by the
 * configured Business Process (see `evaluateMoveToWaitlistAction`).
 */
export function parkingLotWaitlistBypassApplies(input: {
    destinationKey: EnrollmentStatusDestinationKey;
    bypassReason?: string | null;
    bpDestination: BpResolvedEnrollmentDestination | null;
    skippedStageCount: number;
}): boolean {
    if (!input.bypassReason?.trim()) return false;
    if (input.destinationKey !== "waitlist") return false;
    return (
        input.bpDestination?.parkingLot === true
        || input.bpDestination?.requiresTourBypass === true
        || input.skippedStageCount > 0
    );
}

/**
 * Clears ONLY skipped-stage bypass blocking (`bypass_reason` / `skipped_stage_*`).
 * Field-based intake requirements are preserved so configured hard blocks
 * (e.g. Program, Desired Schedule, Desired Start Date) still apply at Waitlist.
 */
export function clearSkippedStageBypassBlocking(
    result: RequirementValidationResult,
): RequirementValidationResult {
    const remaining = result.blocking.filter((v) => !isSkippedStageBypassViolation(v));
    if (remaining.length === result.blocking.length) return result;
    return {
        ...result,
        blocking: remaining,
        ok: remaining.length === 0,
    };
}
