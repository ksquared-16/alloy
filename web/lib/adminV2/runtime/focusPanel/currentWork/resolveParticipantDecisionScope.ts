import type { ParticipantDecisionScope } from "@/lib/lifecycle/participantDecisionClient";
import type { CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

/**
 * The scope a per-child Decision surface needs, derived from the Current Work runtime.
 *
 * ── WHY CURRENT WORK OWNS THIS ──
 *
 * A participant decision is not a card of its own. It is configured on a stage work TEMPLATE
 * (`participant_decisions` on `StageWorkTemplateV1`), and `completeStageWorkWithOutcome` refuses to
 * complete that template while any child is undecided — telling the operator, in Current Work, to
 * "choose a path for each child first". The place that raises the requirement is the place that must
 * offer it; anywhere else and the operator reads an instruction with no corresponding control.
 *
 * Every field comes from the runtime projection the card already holds. Nothing is inferred:
 *
 *   opportunityId  the Record of Truth the work hangs off
 *   departmentId   `runtime.execution.department_id` — the process's own department
 *   stageKey       the surface's committed stage
 *   templateKey    the PRIMARY work item's template
 *
 * Null when any of them is missing, because a partial scope would query a different work item's
 * decisions and present them as this one's.
 */
export function resolveParticipantDecisionScope(args: {
    opportunityId: string | null | undefined;
    surface: Pick<CurrentWorkSurfaceVM, "stageKey" | "primaryWorkItem" | "runtime"> | null | undefined;
}): ParticipantDecisionScope | null {
    const opportunityId = args.opportunityId?.trim() ?? "";
    const surface = args.surface;
    if (!opportunityId || !surface) return null;

    const departmentId = surface.runtime?.execution?.department_id?.trim() ?? "";
    const stageKey = surface.stageKey?.trim() ?? "";
    const templateKey = surface.primaryWorkItem?.template_key?.trim() ?? "";
    if (!departmentId || !stageKey || !templateKey) return null;

    return { opportunityId, departmentId, stageKey, templateKey };
}
