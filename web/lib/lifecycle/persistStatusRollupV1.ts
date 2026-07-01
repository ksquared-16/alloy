/**
 * Persist status_rollup_v1 on lifecycle builder stage metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    LIFECYCLE_BUILDER_METADATA_KEY,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { persistStageStatusAssignments } from "@/lib/lifecycle/persistEnrollmentStageStatusAssignments";
import type { StageStatusEntityType } from "@/lib/lifecycle/stageStatusRollup";
import { groupSelectedKeysByEntityType } from "@/lib/lifecycle/statusCategoryCatalog";
import { loadBusinessProcessStatusCategoryCatalog } from "@/lib/lifecycle/loadStatusCategoryCatalog";
import {
    parseStatusRollupV1,
    STATUS_ROLLUP_METADATA_KEY,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function entityTypeForPersist(entityType: string): StageStatusEntityType | null {
    const t = entityType.trim();
    if (t === "opportunities" || t === "opportunity") return "opportunities";
    if (t === "opportunity_customer_members" || t === "opportunity_customer_member") {
        return "opportunity_customer_members";
    }
    return null;
}

function applyRollupToBuilderStage(
    metadata: Record<string, unknown>,
    stageKey: string,
    rollup: StatusRollupV1
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
            stageRaw[STATUS_ROLLUP_METADATA_KEY] = structuredClone(rollup);
            processRaw.stages[si] = stageRaw;
            builderRaw.processes[pi] = processRaw;
            out[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
            return out;
        }
    }

    return out;
}

export async function persistStatusRollupForLifecycleStageSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        metadata: Record<string, unknown>;
        rollup: StatusRollupV1 | unknown;
    }
): Promise<{ metadata: Record<string, unknown>; rollup: StatusRollupV1 | null; updated: boolean }> {
    const parsed = parseStatusRollupV1(params.rollup);
    if (!parsed) {
        return { metadata: params.metadata, rollup: null, updated: false };
    }

    const sk = params.stageKey.trim();
    const catalog = await loadBusinessProcessStatusCategoryCatalog(supabase, params.orgId);
    const allSelectedKeys = parsed.categories.flatMap((c) => c.selected_status_keys);
    const byEntity = groupSelectedKeysByEntityType(catalog, allSelectedKeys);
    for (const [rawEntityType, keys] of byEntity) {
        if (!keys.length) continue;
        const entityType = entityTypeForPersist(rawEntityType);
        if (!entityType) continue;
        await persistStageStatusAssignments(supabase, params.orgId, sk, keys, entityType);
    }

    const metadata = applyRollupToBuilderStage(params.metadata, sk, parsed);
    const { error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId);
    if (error) throw new Error(error.message);

    return { metadata, rollup: parsed, updated: true };
}

export function readStatusRollupFromStageContainer(container: unknown): StatusRollupV1 | null {
    if (!isRecord(container)) return null;
    return parseStatusRollupV1(container[STATUS_ROLLUP_METADATA_KEY]);
}

export function readStatusRollupFromDepartmentMetadata(
    metadata: Record<string, unknown> | null,
    stageKey: string
): StatusRollupV1 | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stage = process?.stages.find((s) => s.key === stageKey.trim() && s.is_active);
    if (!stage) return null;
    return readStatusRollupFromStageContainer(stage);
}
