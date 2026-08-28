/**
 * THE PROCESS CARD'S COMMAND ROW — a projection of the PUBLISHED Business Process configuration.
 *
 * ── THE OWNERSHIP BOUNDARY THIS FILE EXISTS TO STATE ──
 *
 *   Business Process configuration  decides WHICH commands belong here, and in WHAT ORDER.
 *   The action / capability platform decides WHETHER each of them can execute right now.
 *
 * Those are not interchangeable. A command that is executable is not thereby configured, and a
 * command that is configured does not thereby run. The card asks one question — "what has this
 * process configured for the operator at this stage, on this work?" — and the platform answers a
 * second one about each of the answers.
 *
 * ── WHAT WENT WRONG ──
 *
 * The card read `context.recordHeaderActions`: the registry's generic record-header slots, resolved
 * from what is executable for the record. That list has no reference to the published process at
 * all, so the Process card showed commands the configuration never selected, ordered by the
 * registry, with prominence the card invented (`i === 0`). The two responsibilities were exactly
 * reversed: the platform was choosing the set and the configuration was not consulted.
 *
 * ── WHY THIS IS NOT A SECOND COMMAND LIST ──
 *
 * Every command here comes from `buildCurrentWorkSurfaceVM`, which resolves the published operating
 * plan (`stage_operating_plan_v1` work templates) and stage action catalog through the registered
 * action spine. `resolveCurrentWorkActionButtons` then applies the platform's canonical
 * dominant/helpful treatment — the SAME derivation the What's Next surface uses, written so two
 * surfaces "can NEVER show different buttons". This module renames its output for the card and
 * decides nothing: no selection, no ordering, no emphasis, and no domain keys.
 *
 * ── DRIFT IS REPORTED, NEVER PAPERED OVER ──
 *
 * A configured `action_ref` that no longer resolves to a registered action is dropped silently by
 * the resolvers (they cannot render what they cannot resolve). Silence there reads as "the process
 * configures nothing", which is a different and false statement. So the configured refs are diffed
 * against what resolved, and whatever is missing is reported as configuration drift.
 */

import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import { resolvedHelpfulActionRefs } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";
import {
    isOperatorVisibleActionStatus,
    resolveCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type {
    CurrentWorkActionExecutionStatus,
    CurrentWorkActionVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/** One configured command, resolved. */
export type ProcessCardCommand = {
    /**
     * The registered action's identity. Every downstream step — execution, the shared workspace's
     * intent match, the guards — keys on this. Labels are display only and are never matched on:
     * an override label is configuration's right to rename a command, not to become one.
     */
    key: string;
    /** The configuration ref as authored, when it differs from the resolved handler key. */
    actionRef: string | null;
    label: string;
    /**
     * The platform's canonical treatment, not a card-local ranking: the configured lead command is
     * `primary`, everything else is `secondary`. Exactly one command can be primary.
     */
    prominence: "primary" | "secondary";
    /** Platform-owned. Configuration never decides this. */
    status: CurrentWorkActionExecutionStatus;
    /** Rendered as the unavailable/disabled grammar; null when the command is executable. */
    unavailableReason: string | null;
    /** Handed back to the platform's own planner to execute. Never inspected by presentation. */
    action: CurrentWorkActionVM;
};

export type ProcessCardCommandDrift = {
    actionRef: string;
    slot: "primary_action" | "helpful_action";
    code: "configured_command_not_registered";
    message: string;
};

export type ProcessCardCommandProjection = {
    /**
     * True when a published Business Process revision governs this subject. False means the card
     * has no configuration to project — an empty command row is then the honest answer, and the
     * record-header list is emphatically NOT a substitute for it.
     */
    configured: boolean;
    commands: ProcessCardCommand[];
    drift: ProcessCardCommandDrift[];
};

const EMPTY: ProcessCardCommandProjection = { configured: false, commands: [], drift: [] };

function commandFrom(
    action: CurrentWorkActionVM,
    prominence: ProcessCardCommand["prominence"],
): ProcessCardCommand | null {
    const execution = action.execution ?? resolveCurrentWorkActionExecution(action);
    // `configuration_error` and `hidden` are engineer-facing states. They stay off the card face and
    // surface as drift instead — an operator must never read a platform limitation as a command.
    if (!isOperatorVisibleActionStatus(execution.status)) return null;
    const key = (action.handlerKey ?? action.key).trim();
    if (!key) return null;
    return {
        key,
        actionRef: action.actionRef ?? null,
        label: action.label,
        prominence,
        status: execution.status,
        unavailableReason:
            execution.status === "executable" ? null : (execution.blockers[0]?.message ?? null),
        action,
    };
}

/** Every `action_ref` the published work template configures, in configured order. */
function configuredRefs(context: OperationalContext): Array<{ ref: string; slot: ProcessCardCommandDrift["slot"] }> {
    const published = context.publishedStageInputs;
    if (!published) return [];
    const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
        ...published,
        stageWorkRuntime: context.stageWorkRuntime ?? null,
        recordHeaderActions: context.recordHeaderActions ?? null,
        processStages: published.processStages ?? null,
    });
    const config = resolved?.templateConfig ?? null;
    if (!config) return [];

    const rows: Array<{ ref: string; slot: ProcessCardCommandDrift["slot"] }> = [];
    const primary = config.primary_action?.action_ref?.trim();
    if (primary) rows.push({ ref: primary, slot: "primary_action" });
    for (const row of resolvedHelpfulActionRefs(config) ?? []) {
        const ref = row.action_ref?.trim();
        if (ref) rows.push({ ref, slot: "helpful_action" });
    }
    return rows;
}

/**
 * Project the published configuration's commands for the subject's current stage and work.
 *
 * Pure. Reads only the Operational Context, whose `publishedStageInputs` is the revision the running
 * journey is pinned to — the same payload that produced the rail and the current-work state. Draft
 * configuration is unreachable from here by construction: nothing in this chain reads a builder
 * draft, so an unpublished edit cannot move this card.
 */
export function projectProcessCardCommands(context: OperationalContext): ProcessCardCommandProjection {
    if (!context.publishedStageInputs) return EMPTY;

    const surface = projectCurrentWork(context).surface;
    const buttons = resolveCurrentWorkActionButtons(surface);

    const commands: ProcessCardCommand[] = [];
    const dominant = buttons.dominant ? commandFrom(buttons.dominant, "primary") : null;
    if (dominant) commands.push(dominant);
    for (const helpful of buttons.helpful) {
        const command = commandFrom(helpful, "secondary");
        if (command) commands.push(command);
    }
    if (buttons.subordinateOutcome) {
        const command = commandFrom(buttons.subordinateOutcome, "secondary");
        if (command) commands.push(command);
    }

    // Identity, never label: a configured ref counts as rendered when its intent key is on the row.
    const rendered = new Set<string>();
    for (const command of commands) {
        rendered.add(command.key);
        rendered.add(normalizeActionRefToIntentKey(command.key));
        if (command.actionRef) {
            rendered.add(command.actionRef);
            rendered.add(normalizeActionRefToIntentKey(command.actionRef));
        }
    }

    const drift: ProcessCardCommandDrift[] = [];
    for (const { ref, slot } of configuredRefs(context)) {
        if (rendered.has(ref) || rendered.has(normalizeActionRefToIntentKey(ref))) continue;
        drift.push({
            actionRef: ref,
            slot,
            code: "configured_command_not_registered",
            message:
                `Configured ${slot === "primary_action" ? "primary" : "helpful"} command "${ref}" `
                + "did not resolve to a registered action for this stage.",
        });
    }

    return { configured: true, commands, drift };
}
