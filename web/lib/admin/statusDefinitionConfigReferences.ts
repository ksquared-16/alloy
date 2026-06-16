/**
 * Detect status_key references in business process / lifecycle configuration metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_BUILDER_METADATA_KEY, lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { parseStatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";
import { logDbTiming } from "@/lib/admin/dbQueryTiming";

export type StatusDefinitionConfigReference = {
    kind: "queue_membership" | "work_unit_status_keys" | "status_rollup";
    department_id: string;
    department_name: string;
    process_key?: string;
    stage_key?: string;
    work_unit_key?: string;
};

function keysFromUnknownArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function scanDepartmentMetadata(
    departmentId: string,
    departmentName: string,
    metadata: unknown,
    entityType: string,
    statusKey: string,
): StatusDefinitionConfigReference[] {
    const refs: StatusDefinitionConfigReference[] = [];
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    for (const process of builder.processes) {
        if (!process.is_active) continue;
        for (const stage of process.stages) {
            if (!stage.is_active) continue;

            const membership = stage.queue_membership_v1 ?? parseQueueMembershipV1(
                (stage as { queue_membership_v1?: unknown }).queue_membership_v1,
            );
            if (membership) {
                const statusKeys = membership.included_status_keys ?? [];
                const dispositionKeys = membership.included_disposition_keys ?? [];
                const matchesCase = entityType === "opportunities" && statusKeys.includes(statusKey);
                const matchesChild =
                    entityType === "opportunity_customer_members" && dispositionKeys.includes(statusKey);
                if (matchesCase || matchesChild) {
                    refs.push({
                        kind: "queue_membership",
                        department_id: departmentId,
                        department_name: departmentName,
                        process_key: process.key,
                        stage_key: stage.key,
                    });
                }
            }

            const rollup = stage.status_rollup_v1 ?? parseStatusRollupV1(
                (stage as { status_rollup_v1?: unknown }).status_rollup_v1,
            );
            if (rollup) {
                for (const category of rollup.categories) {
                    const entityMatch =
                        category.entity_type === entityType
                        || (entityType === "opportunities" && category.entity_type === "opportunities")
                        || (entityType === "opportunity_customer_members"
                            && category.entity_type === "opportunity_customer_members");
                    if (!entityMatch) continue;
                    if (category.selected_status_keys.includes(statusKey)) {
                        refs.push({
                            kind: "status_rollup",
                            department_id: departmentId,
                            department_name: departmentName,
                            process_key: process.key,
                            stage_key: stage.key,
                        });
                    }
                }
            }
        }
    }

    const rawMeta =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : {};
    const builderRaw = rawMeta[LIFECYCLE_BUILDER_METADATA_KEY];
    if (builderRaw != null && typeof builderRaw === "object") {
        // work_units may live on denormalized metadata in some paths — scan top-level work_units if present
        const workUnits = (rawMeta as { work_units?: unknown }).work_units;
        if (Array.isArray(workUnits)) {
            for (const wu of workUnits) {
                if (wu == null || typeof wu !== "object") continue;
                const w = wu as Record<string, unknown>;
                const wuMeta = w.metadata;
                if (wuMeta == null || typeof wuMeta !== "object") continue;
                const statusKeys = keysFromUnknownArray((wuMeta as { status_keys?: unknown }).status_keys);
                if (entityType === "opportunities" && statusKeys.includes(statusKey)) {
                    refs.push({
                        kind: "work_unit_status_keys",
                        department_id: departmentId,
                        department_name: departmentName,
                        work_unit_key: String(w.key ?? "").trim() || undefined,
                    });
                }
            }
        }
    }

    return refs;
}

export async function findStatusDefinitionConfigReferences(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    statusKey: string;
}): Promise<StatusDefinitionConfigReference[]> {
    const t0 = Date.now();
    const statusKey = params.statusKey.trim();
    if (!statusKey) return [];

    const { data, error } = await params.supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", params.orgId);

    if (error) {
        throw new Error(error.message);
    }

    const refs: StatusDefinitionConfigReference[] = [];
    for (const row of data ?? []) {
        const departmentId = String((row as { id: string }).id);
        const departmentName = String((row as { name?: string }).name ?? "Department");
        const metadata = (row as { metadata?: unknown }).metadata;
        refs.push(
            ...scanDepartmentMetadata(
                departmentId,
                departmentName,
                metadata,
                params.entityType,
                statusKey,
            ),
        );
    }

    logDbTiming("status_definitions.config_reference_scan", Date.now() - t0, {
        orgId: params.orgId,
        entityType: params.entityType,
        statusKey,
        hitCount: refs.length,
    });

    return refs;
}

export function formatStatusDefinitionConfigReference(ref: StatusDefinitionConfigReference): string {
    const stage = ref.stage_key ? ` stage "${ref.stage_key}"` : "";
    const process = ref.process_key ? ` process "${ref.process_key}"` : "";
    const wu = ref.work_unit_key ? ` work unit "${ref.work_unit_key}"` : "";
    return `${ref.department_name}${process}${stage}${wu} (${ref.kind.replace(/_/g, " ")})`;
}
