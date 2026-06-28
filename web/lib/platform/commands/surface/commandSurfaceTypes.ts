/**
 * Command Surface — platform-owned UI/runtime shell types (Operational Command Runtime V5).
 *
 * The **Command Surface** is the reusable shell for completing an Operational Intent. It is
 * **platform-owned**: layout, flow structure, stage rendering, progress model, preview /
 * confirmation / success / failure patterns, and BOS↔manual convergence are all fixed by the
 * platform and identical across Work Unit, Focus Panel Manage, Queue Row, and BOS.
 *
 * Configuration only influences *content* (availability, placement, labels, description,
 * order, required-input definitions, process/status constraints, confirmation copy). It can
 * NEVER alter the shell anatomy, stage order, lifecycle, or render custom components — see
 * {@link CommandSurfaceConfigInfluence}.
 *
 * These types describe normalized UI state derived from a command snapshot. The surface model
 * is read-only: it prepares UI state, it never executes mutations.
 *
 * @see docs/sprints/06_2026/command_surface_v1.md
 */

import type { ActionBlocker, ActionPreview } from "@/lib/adminV2/actions/actionTypes";
import type { CommandFlow, CommandFlowStage } from "@/lib/platform/commands/commandFlow";
import type { CommandState } from "@/lib/platform/commands/commandState";
import type { LogicalActionPlacement, RequiredSubject } from "@/lib/platform/commands/invocationContext";

/** Surface variants — the SAME shell over the same command snapshot, not separate systems. */
export type CommandSurfaceVariant = "work_unit" | "focus_panel_manage" | "queue_row" | "bos";

/** Which body section the platform renders for the current state. */
export type CommandSurfaceSection =
    | "subject_selector"
    | "input_fields"
    | "blocker"
    | "preview"
    | "confirmation"
    | "executing"
    | "success"
    | "failure";

/** Generic, command-agnostic success/refresh descriptor (CreateLeadSuccess is assignable). */
export type CommandSuccessDescriptor = {
    createdRecordId: string;
    entityType: string;
    title: string | null;
    nextSurface: string;
    refreshTargets: { entityType: string; entityId: string }[];
    successCopy: string;
    nextCopy: string;
};

/**
 * Config-supplied content overrides. This is the ONLY channel configuration has into the
 * surface, and it is intentionally content-only — there is no field for layout, stage order,
 * lifecycle, or components. The platform owns everything not listed here.
 */
export type CommandSurfaceConfigInfluence = {
    titleOverride?: string | null;
    descriptionOverride?: string | null;
    confirmLabelOverride?: string | null;
    /** Operator-facing copy shown when the command is blocked, where config is allowed to set it. */
    blockerCopyOverride?: string | null;
};

/** Normalized input the platform surface consumes. Adapters build this from a command snapshot. */
export type CommandSurfaceInput = {
    intentTitle: string;
    intentDescription: string;
    variant: CommandSurfaceVariant;
    placement: LogicalActionPlacement;
    requiredSubject: RequiredSubject;
    /** Human noun for the subject (e.g. "family"); falls back to a generic noun. */
    subjectNoun?: string | null;
    state: CommandState;
    flow: CommandFlow;
    /** Operator-facing primary message (already humanized by the command model). */
    message: string;
    contextChips?: string[];
    missingInputs?: ActionBlocker[];
    preview?: ActionPreview | null;
    success?: CommandSuccessDescriptor | null;
    errorMessage?: string | null;
    confirmLabel?: string | null;
    previewable?: boolean;
    /** When true, expose raw payload keys in a debug block. Off in operator UI. */
    debug?: boolean;
    rawPayloadKeys?: string[];
};

export type CommandSurfaceStageIndicator = {
    stage: CommandFlowStage;
    label: string;
    /** 1-based index among non-skipped stages. */
    index: number;
    total: number;
};

export type CommandSurfaceHeader = {
    title: string;
    description: string;
    contextChips: string[];
    stage: CommandSurfaceStageIndicator | null;
    state: CommandState;
};

/** A missing input rendered in operator language — never a raw payload key. */
export type CommandSurfaceMissingInput = {
    field: string;
    label: string;
};

export type CommandSurfaceBody = {
    section: CommandSurfaceSection;
    /** Subject prompt when the command needs a subject (Work Unit). */
    missingSubject: string | null;
    missingInputs: CommandSurfaceMissingInput[];
    preview: ActionPreview | null;
    blockerCopy: string | null;
    confirmationSummary: string[] | null;
};

export type CommandSurfaceActionKind =
    | "advance"
    | "execute"
    | "busy"
    | "open_record"
    | "retry"
    | "cancel";

export type CommandSurfaceAction = {
    label: string;
    kind: CommandSurfaceActionKind;
    enabled: boolean;
};

export type CommandSurfaceFooter = {
    primary: CommandSurfaceAction;
    secondary: CommandSurfaceAction | null;
    canCancel: boolean;
};

export type CommandSurfaceSuccess = {
    message: string;
    openRecord: { entityType: string; entityId: string } | null;
    nextCopy: string;
    refreshTargets: { entityType: string; entityId: string }[];
};

export type CommandSurfaceFailure = {
    message: string;
    recovery: string;
    /** Inputs are preserved across a failure so the operator can retry safely. */
    preservesInputs: true;
};

/** Fully normalized, platform-owned surface state ready for a renderer. */
export type CommandSurfaceState = {
    variant: CommandSurfaceVariant;
    header: CommandSurfaceHeader;
    section: CommandSurfaceSection;
    body: CommandSurfaceBody;
    footer: CommandSurfaceFooter;
    success: CommandSurfaceSuccess | null;
    failure: CommandSurfaceFailure | null;
    debug?: { rawPayloadKeys: string[] };
};
