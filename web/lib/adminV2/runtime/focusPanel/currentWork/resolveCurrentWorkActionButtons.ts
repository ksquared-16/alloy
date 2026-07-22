/**
 * ONE derivation of the What's Next action buttons — shared by the summary card AND the focused
 * ("View details") surface so they can NEVER show different buttons.
 *
 * The button set is: a single DOMINANT action (the configured command, or the outcome when the work
 * is outcome-led and has no command), up to two HELPFUL supporting actions, and — when a command
 * already leads — a subordinate "Record outcome" affordance. Generic: derived from the surface's
 * configured action collections, with no action-name / stage-key / process-key branching.
 */
import { isCurrentWorkActionExecutable } from "./executeCurrentWorkAction";
import type { CurrentWorkActionVM, CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionButtons = {
    /** The one leading action — the configured command, or the record-outcome when work is outcome-led. */
    dominant: CurrentWorkActionVM | null;
    /** Up to two supporting actions, shown subordinate to the dominant one. */
    helpful: CurrentWorkActionVM[];
    /** "Record outcome" as a subordinate button, present only when a command already leads. */
    subordinateOutcome: CurrentWorkActionVM | null;
    /** The raw record-outcome action (whether it is the dominant or the subordinate), for identity checks. */
    recordOutcome: CurrentWorkActionVM | null;
    /** True when the dominant action IS the record-outcome (outcome-led work with no command). */
    dominantIsOutcome: boolean;
};

const HELPFUL_LIMIT = 2;

export function resolveCurrentWorkActionButtons(
    surface: Pick<CurrentWorkSurfaceVM, "primaryAction" | "recordOutcomeAction" | "supportingActions">,
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
    const helpful = surface.supportingActions.filter(isCurrentWorkActionExecutable).slice(0, HELPFUL_LIMIT);
    return {
        dominant,
        helpful,
        subordinateOutcome,
        recordOutcome,
        dominantIsOutcome: primary == null && recordOutcome != null,
    };
}
