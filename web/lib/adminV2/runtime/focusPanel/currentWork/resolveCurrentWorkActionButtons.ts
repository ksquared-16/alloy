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
import { isCurrentWorkActionExecutable } from "./executeCurrentWorkAction";
import type { CurrentWorkActionVM, CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkActionButtons = {
    /** The one leading action — the configured command, or the record-outcome when work is outcome-led. */
    dominant: CurrentWorkActionVM | null;
    /** Configured supporting actions, shown subordinate to the dominant one. */
    helpful: CurrentWorkActionVM[];
    /** "Record outcome" as a subordinate button, present only when a command already leads. */
    subordinateOutcome: CurrentWorkActionVM | null;
    /** The raw record-outcome action (whether it is the dominant or the subordinate), for identity checks. */
    recordOutcome: CurrentWorkActionVM | null;
    /** True when the dominant action IS the record-outcome (outcome-led work with no command). */
    dominantIsOutcome: boolean;
};

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
    // Config fidelity: show every configured helpful command (summary and details must agree).
    const helpful = surface.supportingActions.filter(isCurrentWorkActionExecutable);
    return {
        dominant,
        helpful,
        subordinateOutcome,
        recordOutcome,
        dominantIsOutcome: primary == null && recordOutcome != null,
    };
}
