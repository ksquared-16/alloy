/**
 * Command Surface — adapters from command snapshots to the platform surface input
 * (Operational Command Runtime V5).
 *
 * The Command Surface is fed by a generic, command-agnostic snapshot so the SAME shell hosts
 * Create Lead, Update Status, Schedule Tour, etc. These adapters normalize a command model's
 * snapshot into {@link CommandSurfaceInput}; they perform no mutation and add no
 * command-specific UI branching.
 *
 * @see docs/sprints/archive/06_2026/command_surface_v1.md
 */

import { intentsForCapability } from "@/lib/platform/commands/operationalIntent";
import { deriveCommandSurfaceState } from "@/lib/platform/commands/surface/deriveCommandSurfaceState";
import type {
    CommandSurfaceConfigInfluence,
    CommandSurfaceInput,
    CommandSurfaceState,
    CommandSurfaceVariant,
    CommandSuccessDescriptor,
} from "@/lib/platform/commands/surface/commandSurfaceTypes";
import type { CreateLeadCommandSnapshot } from "@/lib/platform/commands/createLead/createLeadCommandModel";
import type { CommandFlow } from "@/lib/platform/commands/commandFlow";
import type { CommandState } from "@/lib/platform/commands/commandState";
import type { ActionBlocker, ActionPreview } from "@/lib/adminV2/actions/actionTypes";
import type { LogicalActionPlacement, RequiredSubject } from "@/lib/platform/commands/invocationContext";

/** Map the logical placement to a surface variant. One shell, many entry points. */
export function commandSurfaceVariantForPlacement(placement: LogicalActionPlacement): CommandSurfaceVariant {
    switch (placement) {
        case "focus_panel_manage":
            return "focus_panel_manage";
        case "queue_row_menu":
            return "queue_row";
        case "bos_recommendations":
            return "bos";
        case "work_unit_actions":
        default:
            return "work_unit";
    }
}

/**
 * Minimal command-agnostic snapshot the surface can consume. CreateLeadCommandSnapshot and any
 * future command snapshot (Update Status, Schedule Tour) satisfy this shape.
 */
export type GenericCommandSnapshot = {
    actionKey: string;
    context: { placement: LogicalActionPlacement; requiredSubject: RequiredSubject };
    flow: CommandFlow;
    state: CommandState;
    message: string;
    missingInputs: ActionBlocker[];
    preview: ActionPreview | null;
    success?: CommandSuccessDescriptor | null;
};

export type CommandSurfaceAdapterOptions = {
    intentTitle?: string | null;
    intentDescription?: string | null;
    subjectNoun?: string | null;
    contextChips?: string[];
    confirmLabel?: string | null;
    errorMessage?: string | null;
    previewable?: boolean;
    debug?: boolean;
    rawPayloadKeys?: string[];
};

/** Resolve operator-facing intent title/description for a capability key. */
function resolveIntentCopy(actionKey: string): { title: string; description: string } {
    const intent = intentsForCapability(actionKey)[0];
    return {
        title: intent?.title ?? actionKey,
        description: intent?.description ?? "",
    };
}

/** Build the platform surface input from a generic command snapshot. */
export function commandSurfaceInputFromSnapshot(
    snapshot: GenericCommandSnapshot,
    options: CommandSurfaceAdapterOptions = {}
): CommandSurfaceInput {
    const copy = resolveIntentCopy(snapshot.actionKey);
    return {
        intentTitle: (options.intentTitle ?? "").trim() || copy.title,
        intentDescription: (options.intentDescription ?? "").trim() || copy.description,
        variant: commandSurfaceVariantForPlacement(snapshot.context.placement),
        placement: snapshot.context.placement,
        requiredSubject: snapshot.context.requiredSubject,
        subjectNoun: options.subjectNoun ?? null,
        state: snapshot.state,
        flow: snapshot.flow,
        message: snapshot.message,
        contextChips: options.contextChips ?? [],
        missingInputs: snapshot.missingInputs,
        preview: snapshot.preview,
        success: snapshot.success ?? null,
        errorMessage: options.errorMessage ?? null,
        confirmLabel: options.confirmLabel ?? null,
        previewable: options.previewable ?? true,
        debug: options.debug ?? false,
        rawPayloadKeys: options.rawPayloadKeys ?? [],
    };
}

/** Derive surface state directly from a generic command snapshot. */
export function deriveCommandSurfaceStateFromSnapshot(
    snapshot: GenericCommandSnapshot,
    options: CommandSurfaceAdapterOptions = {},
    config?: CommandSurfaceConfigInfluence
): CommandSurfaceState {
    return deriveCommandSurfaceState(commandSurfaceInputFromSnapshot(snapshot, options), config);
}

/**
 * Create Lead reference adapter. The Work Unit "family" subject noun and debug payload keys
 * are passed through; execution still runs through the registered create_lead action — the
 * surface only renders state.
 */
export function deriveCreateLeadSurfaceState(
    snapshot: CreateLeadCommandSnapshot,
    options: CommandSurfaceAdapterOptions = {},
    config?: CommandSurfaceConfigInfluence
): CommandSurfaceState {
    return deriveCommandSurfaceStateFromSnapshot(
        snapshot,
        {
            subjectNoun: options.subjectNoun ?? "family",
            rawPayloadKeys: options.rawPayloadKeys ?? Object.keys(snapshot.executePayload ?? {}),
            ...options,
        },
        config
    );
}
