/**
 * Operational Command Runtime — operator-facing command states.
 *
 * A command moves through observable states. The operator must always see a decision
 * they can act on — never a raw technical error where a user decision is required.
 *
 *   available             → ready to run
 *   disabled_blocked      → cannot run; explain why
 *   needs_subject         → choose a subject first (Work Unit rail)
 *   needs_required_input  → supply missing information
 *   preview_ready         → review what will happen
 *   confirmation_required → confirm before executing
 *   executing             → running
 *   success               → done (+ what happened next)
 *   failure               → failed (+ recovery copy)
 *
 * @see docs/platform/modules/actions-and-workflows.md § Operational Command Runtime
 */

import type { ActionBlocker, ActionEligibility } from "@/lib/adminV2/actions/actionTypes";
import type { CommandSubjectResolution, RequiredSubject } from "@/lib/platform/commands/invocationContext";

export type CommandState =
    | "available"
    | "disabled_blocked"
    | "needs_subject"
    | "needs_required_input"
    | "preview_ready"
    | "confirmation_required"
    | "executing"
    | "success"
    | "failure";

export type CommandPhase = "idle" | "executing" | "success" | "failure";

export type CommandStateView = {
    state: CommandState;
    /** Primary operator-facing message. */
    message: string;
    /** Recovery guidance for failure / blocked / needs-* states. */
    recovery?: string | null;
    blockers?: ActionBlocker[];
};

/** Generic, industry-agnostic subject noun. Surfaces may pass a configured label instead. */
function defaultSubjectNoun(requiredSubject: RequiredSubject): string {
    switch (requiredSubject) {
        case "opportunity":
            return "record";
        case "person":
            return "person";
        case "child":
            return "child";
        case "case":
            return "case";
        case "multiple_opportunities":
            return "records";
        case "none":
        default:
            return "record";
    }
}

/** True when a blocker represents missing operator-suppliable input (not a hard state block). */
function isMissingInputBlocker(blocker: ActionBlocker): boolean {
    return blocker.code === "missing_required_input" || Boolean(blocker.field);
}

/**
 * Convert a raw error / blocker into operator-facing copy. Known technical strings are
 * mapped to a user decision; friendly server messages pass through unchanged.
 */
export function operatorErrorCopy(error: string | null | undefined, blockers?: ActionBlocker[]): string {
    const raw = (error ?? "").trim();
    if (raw === "entity_id required") {
        return "Choose a record before running this command.";
    }
    if (raw) return raw;
    const firstBlocker = blockers?.find((b) => b.message?.trim());
    if (firstBlocker) return firstBlocker.message;
    return "Something went wrong. Try again, or contact support if it persists.";
}

/** "Choose a {noun} …" prompt for a Work Unit / selection command. */
export function needsSubjectMessage(input: {
    requiredSubject: RequiredSubject;
    subjectLabel?: string | null;
    commandLabel?: string | null;
}): string {
    const noun = (input.subjectLabel ?? "").trim() || defaultSubjectNoun(input.requiredSubject);
    const command = (input.commandLabel ?? "").trim();
    return command
        ? `Choose a ${noun} before running "${command}".`
        : `Choose a ${noun} to continue.`;
}

export type DescribeCommandStateInput = {
    /** Lifecycle phase from the invoking UI. */
    phase?: CommandPhase;
    /** Subject decision from resolveCommandContext / resolveCommandSubject. */
    subject?: CommandSubjectResolution | null;
    /** Read-only eligibility (blockers, required inputs). */
    eligibility?: ActionEligibility | null;
    /** RegisteredAction.confirmationPolicy === "required" | "destructive". */
    confirmationRequired?: boolean;
    /** A preview has been built and is awaiting operator review. */
    previewReady?: boolean;
    commandLabel?: string | null;
    subjectLabel?: string | null;
    successMessage?: string | null;
    errorMessage?: string | null;
};

/**
 * Derive the operator-facing command state + copy. Resolution order favors the decision
 * the operator must make next (subject → input → preview → confirm → available).
 */
export function describeCommandState(input: DescribeCommandStateInput): CommandStateView {
    const phase = input.phase ?? "idle";

    if (phase === "executing") {
        const label = (input.commandLabel ?? "").trim();
        return { state: "executing", message: label ? `${label}…` : "Running…" };
    }
    if (phase === "success") {
        return { state: "success", message: (input.successMessage ?? "").trim() || "Done." };
    }
    if (phase === "failure") {
        return {
            state: "failure",
            message: operatorErrorCopy(input.errorMessage, input.eligibility?.blockers),
            recovery: "Try again, or adjust the details and re-run.",
            blockers: input.eligibility?.blockers,
        };
    }

    // Idle decision chain.
    if (input.subject && input.subject.mode === "needs_subject") {
        return {
            state: "needs_subject",
            message: needsSubjectMessage({
                requiredSubject: input.subject.requiredSubject,
                subjectLabel: input.subjectLabel,
                commandLabel: input.commandLabel,
            }),
            recovery:
                input.subject.suggestedSubjectId
                    ? "A suggested record is available as a default — confirm it or pick another."
                    : null,
        };
    }

    const eligibility = input.eligibility;
    if (eligibility && !eligibility.eligible) {
        const blockers = eligibility.blockers ?? [];
        const missingInput = blockers.filter(isMissingInputBlocker);
        if (missingInput.length > 0) {
            const labels = missingInput.map((b) => b.message?.trim() || b.field).filter(Boolean);
            return {
                state: "needs_required_input",
                message:
                    labels.length > 0
                        ? `Missing required information: ${labels.join(", ")}.`
                        : "Missing required information.",
                blockers: missingInput,
            };
        }
        return {
            state: "disabled_blocked",
            message: blockers[0]?.message?.trim() || "This command isn't available right now.",
            recovery: "Resolve the listed condition to enable this command.",
            blockers,
        };
    }

    if (input.confirmationRequired && input.previewReady) {
        const label = (input.commandLabel ?? "").trim();
        return {
            state: "confirmation_required",
            message: label ? `Confirm to run "${label}".` : "Confirm to run this command.",
        };
    }
    if (input.previewReady) {
        return { state: "preview_ready", message: "Review what this command will do, then confirm." };
    }
    return { state: "available", message: (input.commandLabel ?? "").trim() || "Ready." };
}
