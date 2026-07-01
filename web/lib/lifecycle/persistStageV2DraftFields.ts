/**
 * Persist V2 builder stage fields (grain, purpose, description, etc.) on stage save.
 *
 * Mirrors persistStageOperatingPlanForLifecycleStageSave but for the new V2 fields
 * introduced by StageEditorV2. All fields are stored in the builder stage JSON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
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

function applyV2DraftToBuilderStage(
    metadata: Record<string, unknown>,
    stageKey: string,
    draft: StageV2DraftInput,
): Record<string, unknown> {
    const out = structuredClone(metadata) as Record<string, unknown>;
    const builderRaw = out[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return out;

    for (let pi = 0; pi < builderRaw.processes.length; pi++) {
        const processRaw = builderRaw.processes[pi];
        if (!isRecord(processRaw) || !Array.isArray(processRaw.stages)) continue;

        for (let si = 0; si < processRaw.stages.length; si++) {
            const stageRaw = processRaw.stages[si];
            if (!isRecord(stageRaw) || String(stageRaw.key ?? "").trim() !== stageKey.trim()) continue;

            if (draft.grain !== undefined) stageRaw.grain = draft.grain;
            if (draft.purpose !== undefined) stageRaw.purpose = draft.purpose;
            if (draft.description !== undefined) stageRaw.description = draft.description || undefined;
            if (draft.parent_stage_key !== undefined) stageRaw.parent_stage_key = draft.parent_stage_key || undefined;
            if (draft.allow_skipping !== undefined) stageRaw.allow_skipping = draft.allow_skipping;
            if (draft.operator_guidance !== undefined) stageRaw.operator_guidance = draft.operator_guidance || undefined;
            if (draft.subject_resolution_strategy !== undefined) stageRaw.subject_resolution_strategy = draft.subject_resolution_strategy;
            if (draft.candidate_actions !== undefined) {
                stageRaw.action_catalog_v1 = { version: 1, candidate_actions: draft.candidate_actions };
            }

            processRaw.stages[si] = stageRaw;
            builderRaw.processes[pi] = processRaw;
            out[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
            return out;
        }
    }

    return out;
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

export async function persistStageV2DraftFields(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        metadata: Record<string, unknown>;
        draft: StageV2DraftInput;
    },
): Promise<{ metadata: Record<string, unknown>; updated: boolean }> {
    const nextMetadata = applyV2DraftToBuilderStage(params.metadata, params.stageKey.trim(), params.draft);

    const { error } = await supabase
        .from("departments")
        .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId);

    if (error) throw new Error(error.message);

    return { metadata: nextMetadata, updated: true };
}
