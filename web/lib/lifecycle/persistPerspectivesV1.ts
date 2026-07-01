/**
 * Persist perspectives_v1 on lifecycle builder stage save.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    PERSPECTIVES_V1_METADATA_KEY,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";

export type PerspectivesV1PersistenceResult = {
    metadata: Record<string, unknown>;
    perspectives: PerspectiveConfigV1Stored[] | null;
    builderStageUpdated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function applyPerspectivesToBuilderStage(
    metadata: Record<string, unknown>,
    stageKey: string,
    perspectives: PerspectiveConfigV1Stored[],
): Record<string, unknown> {
    const out = structuredClone(metadata) as Record<string, unknown>;
    const builderRaw = out[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return out;

    for (let pi = 0; pi < builderRaw.processes.length; pi++) {
        const processRaw = builderRaw.processes[pi];
        if (!isRecord(processRaw) || String(processRaw.key ?? "").trim() !== ENROLLMENT_PROCESS_KEY) continue;
        if (!Array.isArray(processRaw.stages)) continue;

        for (let si = 0; si < processRaw.stages.length; si++) {
            const stageRaw = processRaw.stages[si];
            if (!isRecord(stageRaw) || String(stageRaw.key ?? "").trim() !== stageKey.trim()) continue;
            if (perspectives.length) {
                stageRaw[PERSPECTIVES_V1_METADATA_KEY] = structuredClone(perspectives);
            } else {
                delete stageRaw[PERSPECTIVES_V1_METADATA_KEY];
            }
            processRaw.stages[si] = stageRaw;
            builderRaw.processes[pi] = processRaw;
            out[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
            return out;
        }
    }

    return out;
}

export async function persistPerspectivesForLifecycleStageSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        metadata: Record<string, unknown>;
        explicitPerspectives: PerspectiveConfigV1Stored[];
    },
): Promise<PerspectivesV1PersistenceResult> {
    const stageKey = params.stageKey.trim();
    let metadata = params.metadata;
    const perspectives = params.explicitPerspectives.length ? params.explicitPerspectives : null;

    metadata = applyPerspectivesToBuilderStage(metadata, stageKey, perspectives ?? []);

    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageExists = process?.stages.some((s) => s.key === stageKey && s.is_active) ?? false;
    if (!stageExists) {
        throw new Error(`Stage "${stageKey}" is not configured on this department.`);
    }

    const { error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId);
    if (error) throw new Error(error.message);

    return { metadata, perspectives, builderStageUpdated: true };
}
