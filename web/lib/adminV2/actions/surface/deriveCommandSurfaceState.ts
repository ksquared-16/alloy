/**
 * Command Surface — platform-owned state derivation (Operational Command Runtime V5).
 *
 * `deriveCommandSurfaceState` turns a normalized {@link CommandSurfaceInput} into the fixed,
 * platform-owned {@link CommandSurfaceState}. Anatomy (header/body/footer/success/failure),
 * section selection, stage progress, and action patterns are decided HERE, identically for
 * every variant and every command. Configuration influences content only via
 * {@link CommandSurfaceConfigInfluence}; it can never reach layout, stage order, or lifecycle.
 *
 * Read-only: prepares UI state; never executes.
 *
 * @see docs/sprints/06_2026/command_surface_v1.md
 */

import type { CommandFlowStage } from "@/lib/adminV2/actions/commandFlow";
import type { CommandState } from "@/lib/adminV2/actions/commandState";
import type { RequiredSubject } from "@/lib/adminV2/actions/invocationContext";
import type { ActionBlocker } from "@/lib/adminV2/actions/actionTypes";
import type {
    CommandSurfaceConfigInfluence,
    CommandSurfaceInput,
    CommandSurfaceMissingInput,
    CommandSurfaceSection,
    CommandSurfaceStageIndicator,
    CommandSurfaceState,
} from "@/lib/adminV2/actions/surface/commandSurfaceTypes";

const STAGE_LABELS: Record<CommandFlowStage, string> = {
    resolve_context: "Context",
    resolve_subject: "Choose subject",
    resolve_required_inputs: "Details",
    resolve_constraints: "Checks",
    preview: "Review",
    confirm: "Confirm",
    execute: "Run",
    success: "Done",
};

function subjectNoun(requiredSubject: RequiredSubject, override?: string | null): string {
    const o = (override ?? "").trim();
    if (o) return o;
    switch (requiredSubject) {
        case "person":
            return "person";
        case "child":
            return "child";
        case "case":
            return "case";
        case "multiple_opportunities":
            return "records";
        case "opportunity":
        case "none":
        default:
            return "record";
    }
}

/** Convert a snake_case payload key to a human label (fallback only). */
export function humanizeFieldKey(key: string): string {
    return (key ?? "")
        .trim()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/** Map a blocker to operator-language copy — never leaks a raw payload key. */
function missingInputCopy(blocker: ActionBlocker): CommandSurfaceMissingInput {
    const field = (blocker.field ?? "").trim();
    const message = (blocker.message ?? "").trim();
    const label = message || (field ? humanizeFieldKey(field) : "Required information");
    return { field: field || label, label };
}

/** Platform-fixed mapping: operator command state → which body section renders. */
function sectionForState(state: CommandState): CommandSurfaceSection {
    switch (state) {
        case "needs_subject":
            return "subject_selector";
        case "needs_required_input":
            return "input_fields";
        case "disabled_blocked":
            return "blocker";
        case "preview_ready":
            return "preview";
        case "confirmation_required":
            return "confirmation";
        case "executing":
            return "executing";
        case "success":
            return "success";
        case "failure":
            return "failure";
        case "available":
        default:
            return "confirmation";
    }
}

function stageIndicator(input: CommandSurfaceInput): CommandSurfaceStageIndicator | null {
    const visible = input.flow.stages.filter((s) => s.status !== "skipped");
    const current = input.flow.currentStage;
    if (!current) {
        // Completed flow (success): point at the terminal stage.
        const last = visible[visible.length - 1];
        return last ? { stage: last.stage, label: STAGE_LABELS[last.stage], index: visible.length, total: visible.length } : null;
    }
    const idx = visible.findIndex((s) => s.stage === current);
    if (idx < 0) return null;
    return { stage: current, label: STAGE_LABELS[current], index: idx + 1, total: visible.length };
}

export function deriveCommandSurfaceState(
    input: CommandSurfaceInput,
    config?: CommandSurfaceConfigInfluence
): CommandSurfaceState {
    // Config influences CONTENT only. Anatomy below is platform-owned regardless of config.
    const title = (config?.titleOverride ?? "").trim() || input.intentTitle;
    const description = (config?.descriptionOverride ?? "").trim() || input.intentDescription;
    const confirmLabel = (config?.confirmLabelOverride ?? "").trim() || (input.confirmLabel ?? "").trim() || title;

    const section = sectionForState(input.state);
    const missingInputs = (input.missingInputs ?? []).map(missingInputCopy);
    const noun = subjectNoun(input.requiredSubject, input.subjectNoun);

    const missingSubject =
        input.state === "needs_subject" ? `Choose a ${noun} to continue.` : null;

    const blockerCopy =
        input.state === "disabled_blocked"
            ? (config?.blockerCopyOverride ?? "").trim() || input.message
            : null;

    const confirmationSummary =
        section === "confirmation" || section === "preview"
            ? input.preview?.changes ?? null
            : null;

    // Footer — platform-fixed action pattern.
    const ready = section === "confirmation" || section === "preview" || input.state === "available";
    const primary =
        section === "success"
            ? { label: input.success?.createdRecordId ? "Open record" : "Done", kind: "open_record" as const, enabled: true }
            : section === "failure"
              ? { label: "Try again", kind: "retry" as const, enabled: true }
              : section === "executing"
                ? { label: input.message, kind: "busy" as const, enabled: false }
                : ready
                  ? { label: confirmLabel, kind: "execute" as const, enabled: true }
                  : { label: "Continue", kind: "advance" as const, enabled: false };

    const secondary =
        section === "success"
            ? { label: "Return to work unit", kind: "cancel" as const, enabled: true }
            : section === "executing"
              ? null
              : { label: "Cancel", kind: "cancel" as const, enabled: true };

    const success =
        input.state === "success" && input.success
            ? {
                  message: input.success.successCopy,
                  openRecord: input.success.createdRecordId
                      ? { entityType: input.success.entityType, entityId: input.success.createdRecordId }
                      : null,
                  nextCopy: input.success.nextCopy,
                  refreshTargets: input.success.refreshTargets,
              }
            : null;

    const failure =
        input.state === "failure"
            ? {
                  message: input.message,
                  recovery: "Adjust the details and try again. Your inputs are preserved.",
                  preservesInputs: true as const,
              }
            : null;

    return {
        variant: input.variant,
        header: {
            title,
            description,
            contextChips: input.contextChips ?? [],
            stage: stageIndicator(input),
            state: input.state,
        },
        section,
        body: {
            section,
            missingSubject,
            missingInputs,
            preview: section === "preview" || section === "confirmation" ? input.preview ?? null : null,
            blockerCopy,
            confirmationSummary,
        },
        footer: { primary, secondary, canCancel: section !== "executing" },
        success,
        failure,
        ...(input.debug ? { debug: { rawPayloadKeys: input.rawPayloadKeys ?? [] } } : {}),
    };
}
