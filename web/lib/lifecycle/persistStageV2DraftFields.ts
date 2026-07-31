/**
 * V2 builder stage fields (grain, purpose, description, …) submitted by StageEditorV2.
 *
 * This module used to also PERSIST them, with its own `UPDATE departments.metadata` issued from
 * the stage-runtime-config route after the orchestrator had already written the same column four
 * times. That writer is gone: the fields are now applied to the in-memory draft by
 * `applyStageV2DraftFields` (lib/lifecycle/stageDraftTransforms.ts) and persisted in the single
 * draft write, so nothing here touches the published projection.
 *
 * What remains is the input contract — parsing and its type.
 */

import {
    parseStageGrain,
    parseSubjectResolutionStrategy,
    type StageGrain,
    type StageSubjectResolutionStrategy,
} from "@/lib/lifecycle/stageGrainV1";
import type { StageCandidateAction } from "@/lib/lifecycle/stageActionCatalogV1";

export type StageV2DraftInput = {
    grain?: StageGrain;
    /** Freeform operator-authored purpose description. */
    purpose?: string;
    description?: string;
    parent_stage_key?: string;
    allow_skipping?: boolean;
    operator_guidance?: string;
    subject_resolution_strategy?: StageSubjectResolutionStrategy;
    candidate_actions?: StageCandidateAction[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function parseStageV2DraftInput(raw: unknown): StageV2DraftInput | null {
    if (!isRecord(raw)) return null;
    const result: StageV2DraftInput = {};
    const grain = parseStageGrain(raw.grain);
    if (grain) result.grain = grain;
    if (typeof raw.purpose === "string" && raw.purpose.trim()) result.purpose = raw.purpose.trim();
    if (typeof raw.description === "string") result.description = raw.description;
    if (typeof raw.parent_stage_key === "string") result.parent_stage_key = raw.parent_stage_key;
    if (typeof raw.allow_skipping === "boolean") result.allow_skipping = raw.allow_skipping;
    if (typeof raw.operator_guidance === "string") result.operator_guidance = raw.operator_guidance;
    const resolution = parseSubjectResolutionStrategy(raw.subject_resolution_strategy);
    if (resolution) result.subject_resolution_strategy = resolution;
    if (Array.isArray(raw.candidate_actions)) {
        result.candidate_actions = raw.candidate_actions
            .filter(isRecord)
            .filter((a) => typeof a.action_key === "string" && a.action_key)
            .map((a) => ({
                action_key: String(a.action_key),
                recommendation:
                    a.recommendation === "recommended" || a.recommendation === "ready" || a.recommendation === "context_dependent"
                        ? a.recommendation
                        : "ready",
                ...(typeof a.override_label === "string" && a.override_label ? { override_label: a.override_label } : {}),
            }));
    }
    return result;
}
