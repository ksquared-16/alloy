/**
 * Slice D — one generic contract for how work is RESOLVED.
 *
 * Configured completion outcomes and BP lifecycle transitions are two ways to resolve the
 * current work. This unifies them into a single `CurrentWorkResolutionVM` list — each item
 * carrying label / handler / target / effect / confirmation / execution state — so a host can
 * render both from one collection with no hardcoded target-state logic and no outcome-vs-
 * transition branching. Derived entirely from runtime collections (stage operating plan
 * outcomes + process outgoing transitions); the effect and target come from the runtime, never
 * from a hardcoded map.
 *
 * @see docs/sprints/active/phase-5-whats-next-engineering-handoff.md (Slice D)
 */

import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

import {
    resolveCurrentWorkActionExecution,
    type CurrentWorkActionExecution,
} from "./executeCurrentWorkAction";
import type { CurrentWorkSurfaceVM } from "./currentWorkSurfaceTypes";

export type CurrentWorkResolutionKind = "outcome" | "transition";

/**
 * Shared normalized outcome/transition effect contract. Every resolution's `effect` runs through
 * this one function so a host can render it verbatim: trims blank lines and drops case-insensitive
 * duplicates (the source of "Continue X work · Continue X work"). Presentation-agnostic and generic
 * — no per-label, per-outcome, or per-stage conditions.
 */
export function normalizeResolutionEffect(effect: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of effect) {
        const line = raw.trim();
        if (!line) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
    }
    return out;
}

export type CurrentWorkResolutionVM = {
    kind: CurrentWorkResolutionKind;
    /** outcome_key for outcomes; transition_ref for transitions. */
    key: string;
    label: string;
    /** Generic execution handler — "record_outcome" or "process_stage_transition". */
    handlerKey: string;
    /** outcome_key for outcomes; destination stage key for transitions. Sourced from runtime. */
    targetKey: string | null;
    /** What executing this resolution does — from runtime automation preview / configured label. */
    effect: string[];
    /** Whether execution requires an explicit operator confirmation step. */
    requiresConfirmation: boolean;
    /** Resolved execution/eligibility state (Slice F vocabulary). */
    execution: CurrentWorkActionExecution;
};

type ResolutionInputs = Pick<
    CurrentWorkSurfaceVM,
    "completionOutcomes" | "alternatePaths" | "primaryWorkItem" | "showOutcomeCompletion" | "outcomeCompletionBlockReason"
>;

/** Build the unified resolution list from the surface's configured outcomes + transitions. */
export function buildCurrentWorkResolutions(surface: ResolutionInputs): CurrentWorkResolutionVM[] {
    const resolutions: CurrentWorkResolutionVM[] = [];

    const outcomeExecution: CurrentWorkActionExecution = surface.showOutcomeCompletion
        ? { status: "executable", blockers: [] }
        : {
              status: "blocked",
              blockers: [
                  {
                      code: "outcome_not_recordable",
                      message: surface.outcomeCompletionBlockReason ?? "This outcome cannot be recorded yet.",
                  },
              ],
          };

    for (const outcome of surface.completionOutcomes) {
        const key = outcome.outcome_key?.trim();
        if (!key) continue;
        resolutions.push({
            kind: "outcome",
            key,
            label: outcome.label,
            handlerKey: "record_outcome",
            targetKey: key,
            effect: normalizeResolutionEffect(
                surface.primaryWorkItem ? stageWorkOutcomeEffectLines(surface.primaryWorkItem, key) : [],
            ),
            requiresConfirmation: true,
            execution: outcomeExecution,
        });
    }

    for (const transition of surface.alternatePaths) {
        const key = transition.key?.trim();
        if (!key) continue;
        const effectLine = transition.description?.trim() || transition.label?.trim();
        resolutions.push({
            kind: "transition",
            key,
            label: transition.label,
            handlerKey: transition.handlerKey ?? "process_stage_transition",
            // Destination stage key is derived from the process (actionRef), never hardcoded.
            targetKey: transition.actionRef ?? null,
            effect: normalizeResolutionEffect(effectLine ? [effectLine] : []),
            requiresConfirmation: true,
            execution: transition.execution ?? resolveCurrentWorkActionExecution(transition),
        });
    }

    return resolutions;
}
