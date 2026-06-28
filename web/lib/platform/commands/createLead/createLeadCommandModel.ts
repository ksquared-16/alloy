/**
 * Create Lead — operator-facing command view-model (Operational Command Runtime V4, Phase 3).
 *
 * This is the first operator-visible Operational Command Flow. It is a **read-only
 * view-model over the existing command runtime** — NOT a mutation layer. It answers, for
 * both manual UI and BOS:
 *
 *   - What stage is this command in?       (flow.currentStage)
 *   - What inputs are known / missing?      (knownInputKeys / missingInputs)
 *   - What will be created?                 (preview)
 *   - Is it ready for preview / execute?    (readyForPreview / readyToExecute)
 *   - What operator copy should be shown?   (message, per voice)
 *   - What happens after success?           (success — buildCreateLeadSuccess)
 *
 * Manual UI, BOS, and the Work Unit rail are the SAME command. They differ only by how many
 * inputs are already known (parsed by BOS vs typed manually). Execution always runs through
 * the registered `create_lead` action via `POST /api/admin/actions/execute`. This module
 * never executes or mutates.
 *
 * @see docs/sprints/06_2026/create_lead_command_flow_audit.md
 * @see web/lib/adminV2/actions/commandFlow.ts
 */

import { createLeadAction } from "@/lib/adminV2/actions/definitions/createLeadAction";
import {
    buildCommandFlow,
    type CommandFlow,
    type CommandFlowStage,
} from "@/lib/platform/commands/commandFlow";
import {
    buildCreateLeadEligibility,
    buildCreateLeadPreview,
    createLeadDisplayName,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { buildCreateLeadSuccess, type CreateLeadSuccess } from "@/lib/platform/commands/createLead/createLeadSuccess";
import {
    resolveCommandContext,
    type ResolvedCommandContext,
} from "@/lib/platform/commands/invocationContext";
import type { CommandPhase, CommandState } from "@/lib/platform/commands/commandState";
import type {
    ActionBlocker,
    ActionPreview,
    ActionRequiredInput,
    ActionResultOk,
} from "@/lib/adminV2/actions/actionTypes";

/** Operator-facing entry points. They share one command; only known inputs differ. */
export type CreateLeadEntryPoint = "manual" | "work_unit_actions" | "bos";

/** Copy voice: neutral operator UI vs. BOS conversational phrasing. Same underlying state. */
export type CommandVoice = "operator" | "bos";

const SURFACE_BY_ENTRY: Record<CreateLeadEntryPoint, string> = {
    manual: "right_rail",
    work_unit_actions: "work_unit",
    bos: "bos_recommendations",
};

export type DeriveCreateLeadCommandInput = {
    /** Canonical create_lead payload field map (manual values or BOS-parsed values). */
    knownInputs: Record<string, unknown>;
    entryPoint: CreateLeadEntryPoint;
    /** Optional explicit physical surface; defaults from entryPoint. */
    surface?: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Lifecycle phase from the invoking UI (idle while gathering; executing/success/failure on submit). */
    phase?: CommandPhase;
    /** Success result from the registered action (when phase === "success"). */
    result?: ActionResultOk | null;
    /** Error message when phase === "failure". */
    errorMessage?: string | null;
    /** Config-supplied required-input hints (e.g. stage field_rules). */
    configRequiredInputs?: readonly ActionRequiredInput[];
    voice?: CommandVoice;
    commandLabel?: string | null;
};

export type CreateLeadCommandSnapshot = {
    actionKey: string;
    entryPoint: CreateLeadEntryPoint;
    context: ResolvedCommandContext;
    flow: CommandFlow;
    stage: CommandFlowStage | null;
    state: CommandState;
    message: string;
    /** Required-input keys that currently have a value. */
    knownInputKeys: string[];
    /** Missing required inputs the operator must still supply (operator language). */
    missingInputs: ActionBlocker[];
    /** Read-only dry-run of what execute will create. */
    preview: ActionPreview;
    readyForPreview: boolean;
    readyToExecute: boolean;
    /** The exact body payload to POST to /api/admin/actions/execute (no mutation here). */
    executePayload: Record<string, unknown>;
    /** Standardized success/refresh descriptor (present when phase === "success"). */
    success: CreateLeadSuccess | null;
};

/**
 * Voice-specific copy for a command state. Maps the SAME `CommandState` to either neutral
 * operator UI copy or BOS conversational phrasing — the state machine is shared; only the
 * phrasing differs.
 */
export function createLeadStateMessage(input: {
    state: CommandState;
    voice: CommandVoice;
    baseMessage: string;
    missingInputs: ActionBlocker[];
    name?: string | null;
}): string {
    if (input.voice !== "bos") return input.baseMessage;
    const name = (input.name ?? "").trim();
    switch (input.state) {
        case "needs_required_input": {
            const labels = input.missingInputs
                .map((b) => b.message?.replace(/ is required\.?$/i, "").trim() || b.field)
                .filter(Boolean);
            return labels.length > 0
                ? `I still need ${labels.join(", ")} before I can create this lead.`
                : "I still need a bit more information before I can create this lead.";
        }
        case "preview_ready":
        case "confirmation_required":
            return "I found enough information to create this lead. Review it before I create it.";
        case "available":
            return "Ready to create this lead.";
        case "executing":
            return "Creating lead…";
        case "success":
            return name ? `Lead created for ${name}. Opening record.` : "Lead created. Opening record.";
        default:
            return input.baseMessage;
    }
}

/**
 * Derive the Create Lead command snapshot. Pure/read-only: builds eligibility, flow, preview,
 * and success descriptor from the known inputs and phase. Both BOS and manual entry call this
 * with the same shape; BOS simply arrives with more `knownInputs` already populated.
 */
export function deriveCreateLeadCommandState(
    input: DeriveCreateLeadCommandInput
): CreateLeadCommandSnapshot {
    const knownInputs = input.knownInputs ?? {};
    const voice = input.voice ?? (input.entryPoint === "bos" ? "bos" : "operator");
    const surface = input.surface ?? SURFACE_BY_ENTRY[input.entryPoint];
    const commandLabel = input.commandLabel ?? createLeadAction.defaultLabel;

    const context = resolveCommandContext({
        action: createLeadAction,
        surface,
        workUnitId: input.workUnitId,
    });

    const eligibility = buildCreateLeadEligibility(knownInputs, input.configRequiredInputs);
    const preview = buildCreateLeadPreview(knownInputs);
    const name = createLeadDisplayName(knownInputs);
    const success =
        input.phase === "success" && input.result?.ok
            ? buildCreateLeadSuccess({ result: input.result, knownInputs })
            : null;

    const flow = buildCommandFlow({
        requiredSubject: context.requiredSubject,
        subject: context.subject,
        eligibility,
        confirmationPolicy: createLeadAction.confirmationPolicy,
        previewable: true,
        phase: input.phase,
        commandLabel,
        successMessage: success?.successCopy ?? null,
        errorMessage: input.errorMessage,
    });

    const missingInputs = eligibility.blockers.filter(
        (b) => b.code === "missing_required_input" || Boolean(b.field)
    );
    const knownInputKeys = eligibility.requiredInputs
        .map((i) => i.key)
        .filter((key) => String(knownInputs[key] ?? "").trim().length > 0);

    const readyForPreview = eligibility.eligible;
    const readyToExecute = eligibility.eligible && input.phase !== "executing";

    const message = createLeadStateMessage({
        state: flow.state,
        voice,
        baseMessage: flow.message,
        missingInputs,
        name,
    });

    return {
        actionKey: createLeadAction.actionKey,
        entryPoint: input.entryPoint,
        context,
        flow,
        stage: flow.currentStage,
        state: flow.state,
        message,
        knownInputKeys,
        missingInputs,
        preview,
        readyForPreview,
        readyToExecute,
        executePayload: { ...knownInputs },
        success,
    };
}

/**
 * BOS entry-point adapter (Phase 4). BOS parses a conversation into a draft field map
 * (`values`); this converts that into a Create Lead command snapshot in BOS voice. It does
 * NOT introduce a separate mutation path — the resulting `executePayload` is submitted via
 * the same `POST /api/admin/actions/execute` registered create_lead path as manual entry.
 *
 * BOS "progressively removes stages": with complete parsed values it arrives at preview/
 * confirm; with missing values it surfaces the missing fields in operator language.
 */
export function deriveCreateLeadCommandFromBosProposal(input: {
    parsedValues: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    phase?: CommandPhase;
    result?: ActionResultOk | null;
    errorMessage?: string | null;
    configRequiredInputs?: readonly ActionRequiredInput[];
}): CreateLeadCommandSnapshot {
    return deriveCreateLeadCommandState({
        knownInputs: input.parsedValues ?? {},
        entryPoint: "bos",
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        phase: input.phase,
        result: input.result,
        errorMessage: input.errorMessage,
        configRequiredInputs: input.configRequiredInputs,
        voice: "bos",
    });
}
