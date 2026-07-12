/**
 * Operational Command Runtime V3 — reusable Flow Stage model.
 *
 * Operators experience a command as a guided flow, never a dialog/form/mutation. Every
 * flow is composed from the SAME reusable stages; a command uses only the stages it needs,
 * and the runtime — not the UI — determines what happens next based on how much context is
 * already resolved.
 *
 *   resolve_context → resolve_subject → resolve_required_inputs → resolve_constraints
 *     → preview → confirm → execute → success
 *
 * The same command run from different entry points simply has more stages already
 * complete:
 *   Work Unit    → resolve_subject is the first open stage (choose a family).
 *   Focus Panel  → subject is inherited; first open stage is inputs/preview.
 *   BOS          → subject + inputs resolved conversationally; first open stage is preview.
 *
 * @see docs/sprints/archive/06_2026/operational_command_runtime_v3.md
 */

import type { ActionEligibility } from "@/lib/adminV2/actions/actionTypes";
import type { CommandSubjectResolution, RequiredSubject } from "@/lib/platform/commands/invocationContext";
import { describeCommandState, type CommandPhase, type CommandState } from "@/lib/platform/commands/commandState";

export type CommandFlowStage =
    | "resolve_context"
    | "resolve_subject"
    | "resolve_required_inputs"
    | "resolve_constraints"
    | "preview"
    | "confirm"
    | "execute"
    | "success";

export const COMMAND_FLOW_STAGES: readonly CommandFlowStage[] = [
    "resolve_context",
    "resolve_subject",
    "resolve_required_inputs",
    "resolve_constraints",
    "preview",
    "confirm",
    "execute",
    "success",
] as const;

export type CommandFlowStageStatus = "complete" | "active" | "pending" | "skipped" | "blocked";

export type CommandFlowStageView = {
    stage: CommandFlowStage;
    status: CommandFlowStageStatus;
};

export type ConfirmationPolicy = "required" | "none" | "destructive";

export type BuildCommandFlowInput = {
    requiredSubject: RequiredSubject;
    /** Subject decision from resolveCommandContext / resolveCommandSubject. */
    subject: CommandSubjectResolution;
    /** Read-only eligibility (blockers, required inputs). When omitted, assumed satisfied. */
    eligibility?: ActionEligibility | null;
    confirmationPolicy?: ConfirmationPolicy;
    /** Capability can build a preview (registered commands can). Defaults true. */
    previewable?: boolean;
    phase?: CommandPhase;
    commandLabel?: string | null;
    subjectLabel?: string | null;
    successMessage?: string | null;
    errorMessage?: string | null;
};

export type CommandFlow = {
    stages: CommandFlowStageView[];
    /** First non-complete, non-skipped stage; null when the command has completed. */
    currentStage: CommandFlowStage | null;
    state: CommandState;
    message: string;
};

/** Which flow stage a given operator state is "sitting in". */
function stageForState(state: CommandState, previewable: boolean): CommandFlowStage | null {
    switch (state) {
        case "needs_subject":
            return "resolve_subject";
        case "needs_required_input":
            return "resolve_required_inputs";
        case "disabled_blocked":
            return "resolve_constraints";
        case "preview_ready":
            return previewable ? "preview" : "execute";
        case "confirmation_required":
            return "confirm";
        case "available":
            return previewable ? "preview" : "execute";
        case "executing":
            return "execute";
        case "failure":
            return "execute";
        case "success":
            return null;
        default:
            return "preview";
    }
}

/**
 * Compose a command's flow from the reusable stages. The runtime decides the current stage
 * from the resolved snapshot (subject, eligibility, confirmation, phase); the UI just
 * renders the stage the runtime points to.
 */
export function buildCommandFlow(input: BuildCommandFlowInput): CommandFlow {
    const previewable = input.previewable ?? true;
    const confirmationPolicy = input.confirmationPolicy ?? "required";
    const hasRequiredInputs = (input.eligibility?.requiredInputs?.length ?? 0) > 0;
    const subjectSkipped = input.requiredSubject === "none" || input.subject.mode === "open";

    const view = describeCommandState({
        phase: input.phase,
        subject: input.subject,
        eligibility: input.eligibility,
        confirmationRequired: confirmationPolicy !== "none",
        // Preview/confirm are only reachable once readiness gates pass; describeCommandState
        // already orders subject/input/blocker checks ahead of preview, so flagging
        // previewReady here is safe — it only "wins" when nothing earlier is pending.
        previewReady: previewable,
        commandLabel: input.commandLabel,
        subjectLabel: input.subjectLabel,
        successMessage: input.successMessage,
        errorMessage: input.errorMessage,
    });

    const current = stageForState(view.state, previewable);
    const blockedStage = view.state === "disabled_blocked" || view.state === "failure";

    const skipped = (stage: CommandFlowStage): boolean => {
        if (stage === "resolve_subject") return subjectSkipped;
        if (stage === "resolve_required_inputs") return !hasRequiredInputs;
        if (stage === "preview") return !previewable;
        if (stage === "confirm") return confirmationPolicy === "none";
        return false;
    };

    const orderIndex = (stage: CommandFlowStage) => COMMAND_FLOW_STAGES.indexOf(stage);
    const currentIdx = current ? orderIndex(current) : COMMAND_FLOW_STAGES.length; // success → all complete

    const stages: CommandFlowStageView[] = COMMAND_FLOW_STAGES.map((stage) => {
        if (skipped(stage)) return { stage, status: "skipped" as const };
        const idx = orderIndex(stage);
        if (idx < currentIdx) return { stage, status: "complete" as const };
        if (idx === currentIdx) {
            return { stage, status: blockedStage ? ("blocked" as const) : ("active" as const) };
        }
        return { stage, status: "pending" as const };
    });

    return { stages, currentStage: current, state: view.state, message: view.message };
}
