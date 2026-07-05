/**
 * Persist process-level participation_v1 on the lifecycle builder process record — the Publish step
 * of Process Builder → Participation Definition → Publish → Engine. Reuses the SAME department
 * metadata store as work_views_v1 / tracks_v1; no parallel persistence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    mergeLifecycleBuilderIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseParticipationConfigV1, type ParticipationConfigV1 } from "@/lib/process/participationConfig";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export async function persistParticipationForProcessSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        processId: string;
        metadata: Record<string, unknown>;
        participation: ParticipationConfigV1;
    },
): Promise<{ metadata: Record<string, unknown>; participation: ParticipationConfigV1 }> {
    const processId = params.processId.trim();
    const builder = lifecycleBuilderFromDepartmentMetadata(params.metadata);
    const process = builder.processes.find((p) => p.id === processId);
    if (!process) {
        throw new Error(`Process "${processId}" is not configured on this department.`);
    }

    const nextBuilder = {
        ...builder,
        processes: builder.processes.map((p) =>
            p.id === processId ? { ...p, participation_v1: params.participation } : p,
        ),
    };

    const metadata = mergeLifecycleBuilderIntoMetadata(params.metadata, nextBuilder) as Record<string, unknown>;

    const { error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId);
    if (error) throw new Error(error.message);

    return { metadata, participation: params.participation };
}

/** Read the saved participation config for a process from department metadata (null when unset). */
export function readParticipationFromMetadata(
    metadata: unknown,
    processId: string,
): ParticipationConfigV1 | null {
    if (!isRecord(metadata)) return null;
    const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return null;
    for (const processRaw of builderRaw.processes) {
        if (!isRecord(processRaw) || String(processRaw.id ?? "").trim() !== processId.trim()) continue;
        return parseParticipationConfigV1(processRaw.participation_v1);
    }
    return null;
}
