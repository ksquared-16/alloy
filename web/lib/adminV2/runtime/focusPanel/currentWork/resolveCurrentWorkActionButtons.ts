/**
 * ONE derivation of the What's Next action buttons — shared by the summary card AND the focused
 * ("View details") surface so they can NEVER show different buttons.
 *
 * The button set is: a single DOMINANT action (the configured command, or the outcome when the work
 * is outcome-led and has no command), configured HELPFUL supporting actions (no silent truncate),
 * and — when a command already leads — a subordinate "Record outcome" affordance. Generic: derived
 * from the surface's configured action collections, with no action-name / stage-key / process-key
 * branching.
 */
import {
    isCurrentWorkActionExecutable,
    isCurrentWorkActionOperatorVisible,
} from "./executeCurrentWorkAction";
import type { CurrentWorkActionVM, CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionButtons = {
    /** The one leading action — the configured command, or the record-outcome when work is outcome-led. */
    dominant: CurrentWorkActionVM | null;
    /** Configured supporting actions, shown subordinate to the dominant one. */
    helpful: CurrentWorkActionVM[];
    /** "Record outcome" as a subordinate button, present only when a command already leads. */
    subordinateOutcome: CurrentWorkActionVM | null;
    /**
     * The process-owned other transitions — the other ways this work can legitimately end.
     *
     * `buildCurrentWorkSurfaceVM` resolves these from the published stage plan and puts them on
     * `alternatePaths`. Only `CurrentWorkWorkspace` ever read them, and the Focus Panel does not
     * mount that component — so a transition that resolved correctly all the way to the surface
     * model had no control. Enrollment's Lead stage declares `lead_to_tour → tour`; instrumenting
     * the live panel showed `alternatePaths: ["lead_to_tour"]` arriving on every recompute while the
     * operator had no way to leave the first stage of the journey.
     *
     * Deliberately separate from `helpful`: "Schedule tour" arranges a tour, "Move to Tour" advances
     * the journey. They answer different questions and must not merge into one control.
     */
    alternatePaths: CurrentWorkActionVM[];
    /** The raw record-outcome action (whether it is the dominant or the subordinate), for identity checks. */
    recordOutcome: CurrentWorkActionVM | null;
    /** True when the dominant action IS the record-outcome (outcome-led work with no command). */
    dominantIsOutcome: boolean;
};

export function resolveCurrentWorkActionButtons(
    // `alternatePaths` is optional so callers building a partial surface keep compiling; an absent
    // list renders no transitions, which is exactly what they showed before.
    surface: Pick<CurrentWorkSurfaceVM, "primaryAction" | "recordOutcomeAction" | "supportingActions">
        & Partial<Pick<CurrentWorkSurfaceVM, "alternatePaths">>,
): CurrentWorkActionButtons {
    const primary =
        surface.primaryAction
        && surface.primaryAction.handlerKey !== "expand_work"
        && isCurrentWorkActionExecutable(surface.primaryAction)
            ? surface.primaryAction
            : null;
    const recordOutcome =
        surface.recordOutcomeAction && isCurrentWorkActionExecutable(surface.recordOutcomeAction)
            ? surface.recordOutcomeAction
            : null;
    // When a command exists it leads and the outcome stays subordinate; when the work is outcome-led
    // (no command), declaring the outcome IS the obligation, so it leads.
    const dominant = primary ?? recordOutcome;
    const subordinateOutcome = primary ? recordOutcome : null;
    // Config fidelity: project every operator-visible configured helpful command (executable or
    // blocked/disabled with reason). Do not silently drop blocked related-subject commands.
    const helpful = surface.supportingActions.filter(isCurrentWorkActionOperatorVisible);
    // Same fidelity rule as helpful actions: project everything operator-visible, including blocked
    // with a reason, rather than silently dropping configured progression.
    const alternatePaths = (surface.alternatePaths ?? []).filter(isCurrentWorkActionOperatorVisible);
    return {
        dominant,
        helpful,
        alternatePaths,
        subordinateOutcome,
        recordOutcome,
        dominantIsOutcome: primary == null && recordOutcome != null,
    };
}
