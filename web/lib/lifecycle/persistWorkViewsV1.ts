/**
 * Persist process-level work_views_v1 on lifecycle builder process record.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    mergeLifecycleBuilderIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    WORK_VIEWS_V1_METADATA_KEY,
    normalizeWorkViewsDisplayOrder,
    parseWorkViewsV1,
    type WorkViewConfigV1Stored,
} from "@/lib/lifecycle/workViewsConfigV1";
import { invalidateTenantConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export async function persistWorkViewsForProcessSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        processId: string;
        metadata: Record<string, unknown>;
        workViews: WorkViewConfigV1Stored[];
    },
): Promise<{ metadata: Record<string, unknown>; workViews: WorkViewConfigV1Stored[] }> {
    const processId = params.processId.trim();
    const normalized = normalizeWorkViewsDisplayOrder(params.workViews);

    const builder = lifecycleBuilderFromDepartmentMetadata(params.metadata);
    const process = builder.processes.find((p) => p.id === processId);
    if (!process) {
        throw new Error(`Process "${processId}" is not configured on this department.`);
    }

    const nextBuilder = {
        ...builder,
        processes: builder.processes.map((p) =>
            p.id === processId ?
                {
                    ...p,
                    work_views_v1: normalized.length ? normalized : undefined,
                }
            :   p,
        ),
    };

    const metadata = mergeLifecycleBuilderIntoMetadata(params.metadata, nextBuilder) as Record<string, unknown>;

    const { error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId);
    if (error) throw new Error(error.message);

    // Work Views live on department lifecycle metadata; bust provisioning config reads so the
    // pill strip reflects the save immediately (TTL alone can leave a deleted view visible).
    invalidateTenantConfigReadCache(params.orgId);

    return { metadata, workViews: normalized };
}

export function readWorkViewsFromMetadata(
    metadata: unknown,
    processId: string,
): WorkViewConfigV1Stored[] | null {
    if (!isRecord(metadata)) return null;
    const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return null;
    for (const processRaw of builderRaw.processes) {
        if (!isRecord(processRaw) || String(processRaw.id ?? "").trim() !== processId.trim()) continue;
        return parseWorkViewsV1(processRaw[WORK_VIEWS_V1_METADATA_KEY]);
    }
    return null;
}
