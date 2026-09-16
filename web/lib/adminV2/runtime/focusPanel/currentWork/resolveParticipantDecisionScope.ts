import type { ParticipantDecisionScope } from "@/lib/lifecycle/participantDecisionClient";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
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
    const surface = args.surface;
    if (!surface) return null;
    return resolveParticipantDecisionScopeFromRuntime({
        opportunityId: args.opportunityId,
        runtime: surface.runtime,
        /*
         * The surface has already committed to a stage and a primary item, so ITS answers are the
         * ones that count — coerced to "" rather than left undefined so a surface that has no primary
         * work still resolves to null here, exactly as it did before this delegation existed, instead
         * of silently widening to whatever the runtime's primary happens to be.
         */
        stageKey: surface.stageKey ?? "",
        templateKey: surface.primaryWorkItem?.template_key ?? "",
    });
}

/**
 * THE SAME SCOPE, FOR A HOST THAT IS NOT THE CURRENT WORK SURFACE.
 *
 * The per-child decisions are the primary work of a stage, and the card that presents that stage is
 * not always Current Work — the Business Process card SUPERSEDES it for an active process, which is
 * why a published layout composes no `current_work` cell at all. Measured on the Decision stage: the
 * surface rendered, the endpoint was correct, and zero `/participant-decisions` requests were made,
 * because the only component that asks lived on a card that was not on screen.
 *
 * So the scope is resolved from the runtime projection both hosts already hold, and
 * `resolveParticipantDecisionScope` delegates here. One implementation, two entry points: a Process
 * card and a Current Work card cannot disagree about which work's decisions they are showing.
 */
export function resolveParticipantDecisionScopeFromRuntime(args: {
    opportunityId: string | null | undefined;
    runtime: StageWorkRuntimeProjection | null | undefined;
    /** Optional overrides when the host has already committed to narrower answers. */
    stageKey?: string | null;
    templateKey?: string | null;
}): ParticipantDecisionScope | null {
    const opportunityId = args.opportunityId?.trim() ?? "";
    const runtime = args.runtime;
    if (!opportunityId || !runtime) return null;

    const departmentId = runtime.execution?.department_id?.trim() ?? "";
    const stageKey = (args.stageKey ?? runtime.stage_key)?.trim() ?? "";
    /*
     * The stage's primary work when the host named none. `primary` is the template the plan marked
     * primary; a stage whose only work is unflagged still answers through `additional`, which is the
     * exact shape the Decision stage has — `review_child_paths` is required but not flagged primary.
     */
    const templateKey =
        (args.templateKey ?? runtime.primary?.template_key ?? runtime.additional?.[0]?.template_key)?.trim() ?? "";
    if (!departmentId || !stageKey || !templateKey) return null;

    return { opportunityId, departmentId, stageKey, templateKey };
}
