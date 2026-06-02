/**
 * Per-stage lifecycle work units (`work_units.key` = `lifecycle_wu_{stage}`).
 * One row per builder stage queue — `/dept` lists each; `/work-unit/:id` filters by stage statuses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { slugifyLifecycleKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    queueStatusKeysForOperatorStage,
    snapshotEnrollmentPipelineWorkUnit,
    type EnrollmentPipelineWorkUnitSnapshot,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

export const LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX = "lifecycle_wu_" as const;

export type LifecycleStageWorkUnitMetadata = {
    lifecycle_builder_owned_v1: { builder_owned: true };
    lifecycle_stage_key: string;
    lifecycle_stage_label?: string;
    lifecycle_process_id?: string;
    status_keys?: string[];
};

export function stageKeyFromLifecycleWorkUnitMetadata(metadata: unknown): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const sk = (metadata as LifecycleStageWorkUnitMetadata).lifecycle_stage_key;
    return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

export function isLifecycleStageWorkUnitKey(key: string | null | undefined): boolean {
    const k = (key ?? "").trim().toLowerCase();
    return k.startsWith(LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX);
}

/** Stable `work_units.key` for a lifecycle stage (unique per department). */
export function lifecycleStageWorkUnitKey(stageKey: string): string {
    const slug = slugifyLifecycleKey(stageKey);
    const base = `${LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX}${slug}`;
    return base.slice(0, 50);
}

export function primaryQueueKeyForLifecycleStage(stageKey: string): string {
    return `lifecycle_${slugifyLifecycleKey(stageKey).slice(0, 40)}`;
}

export function buildLifecycleStageWorkUnitMetadata(
    stageKey: string,
    opts?: { processId?: string; statusKeys?: readonly string[]; stageLabel?: string }
): LifecycleStageWorkUnitMetadata {
    const label = opts?.stageLabel?.trim();
    return {
        lifecycle_builder_owned_v1: { builder_owned: true },
        lifecycle_stage_key: stageKey.trim(),
        ...(label ? { lifecycle_stage_label: label } : {}),
        ...(opts?.processId ? { lifecycle_process_id: opts.processId } : {}),
        ...(opts?.statusKeys?.length ? { status_keys: [...opts.statusKeys] } : {}),
    };
}

function filterListWithValues(filters: unknown, type: string, values: string[]): unknown[] {
    const list = Array.isArray(filters) ? [...filters] : [];
    let replaced = false;
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f == null || typeof f !== "object") continue;
        const row = f as { type?: string };
        if (String(row.type ?? "") !== type) continue;
        list[i] = { ...row, operator: "in", values: [...values] };
        replaced = true;
        break;
    }
    if (!replaced && values.length) {
        list.push({ type, operator: "in", values: [...values] });
    }
    return list;
}

/** Single-lane opportunity queue for one lifecycle stage. */
export function buildLifecycleStageQueueDefinition(params: {
    stageKey: string;
    label: string;
    statusKeys: readonly string[];
}): Record<string, unknown> {
    const queueKey = primaryQueueKeyForLifecycleStage(params.stageKey);
    const label = params.label.trim() || "Queue";
    const values = params.statusKeys.map((k) => k.trim()).filter(Boolean);
    const statusFilters = filterListWithValues([], "status", values);
    const caseFilters = filterListWithValues([], "case_status", values);
    const queue = {
        key: queueKey,
        label,
        grain: "case" as const,
        filters_compat_v1: statusFilters,
        filters: caseFilters,
    };
    const doc: Record<string, unknown> = {
        version: 2,
        entity_type: "opportunity",
        ui: {
            layout: "single_section",
            primary_total_label: label,
            primary_total_queue: queueKey,
            suppress_active_queue_description: false,
            sections: [{ key: "primary", label, queue_keys: [queueKey] }],
            row_preview: {
                variant: "crm_compact",
                fields: [
                    "title",
                    "status",
                    "primary_contact",
                    "phone",
                    "email",
                    "child_name",
                    "program",
                    "desired_start_date",
                ],
                actions: ["open"],
            },
        },
        queues: [queue],
    };
    loadQueueDefinitionBundle(doc);
    return doc;
}

export function applyStatusKeysToLifecycleStageQueueDefinition(
    queueDefinition: unknown,
    statusKeys: readonly string[]
): Record<string, unknown> {
    const raw =
        queueDefinition != null && typeof queueDefinition === "object" && !Array.isArray(queueDefinition)
            ? (structuredClone(queueDefinition) as Record<string, unknown>)
            : { version: 2, entity_type: "opportunity", queues: [] };
    const values = statusKeys.map((k) => k.trim()).filter(Boolean);
    const queuesRaw = raw.queues;
    if (!Array.isArray(queuesRaw) || !queuesRaw.length) {
        throw new Error("queue_definition has no queues array");
    }
    const idx = queuesRaw.findIndex((q) => q != null && typeof q === "object");
    if (idx < 0) throw new Error("queue_definition has no executable queue");
    const queue = queuesRaw[idx] as Record<string, unknown>;
    queue.filters_compat_v1 = filterListWithValues(queue.filters_compat_v1, "status", values);
    queue.filters = filterListWithValues(queue.filters, "case_status", values);
    queuesRaw[idx] = queue;
    loadQueueDefinitionBundle(raw);
    return raw;
}

export type LifecycleStageWorkUnitRow = {
    id: string;
    key: string;
    name: string;
    department_id: string;
    queue_definition: unknown;
    is_active: boolean;
    metadata: unknown;
};

export async function loadLifecycleStageWorkUnitForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string
): Promise<LifecycleStageWorkUnitRow | null> {
    const key = lifecycleStageWorkUnitKey(stageKey);
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, queue_definition, is_active, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", key)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data as LifecycleStageWorkUnitRow;
}

export async function listLifecycleStageWorkUnitsForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<LifecycleStageWorkUnitRow[]> {
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, queue_definition, is_active, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r) =>
        isLifecycleStageWorkUnitKey(String((r as { key?: string }).key ?? ""))
    ) as LifecycleStageWorkUnitRow[];
}

/** Prefer per-stage work unit; fall back to legacy enrollment_pipeline. */
export async function loadStageWorkUnitSnapshotForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string
): Promise<EnrollmentPipelineWorkUnitSnapshot | null> {
    const stageRow = await loadLifecycleStageWorkUnitForDepartment(supabase, orgId, departmentId, stageKey);
    if (stageRow) {
        return snapshotEnrollmentPipelineWorkUnit(stageRow);
    }
    const { data } = await supabase
        .from("work_units")
        .select("id, key, name, is_active, queue_definition")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
        .eq("is_active", true)
        .maybeSingle();
    if (!data) return null;
    return snapshotEnrollmentPipelineWorkUnit(
        data as { id: string; key: string; name: string; is_active: boolean; queue_definition: unknown }
    );
}

export function departmentUsesLifecycleStageWorkUnits(
    workUnits: readonly { key?: string | null }[]
): boolean {
    return workUnits.some((w) => isLifecycleStageWorkUnitKey(w.key));
}

export function queueStatusKeysForStageWorkUnitSnapshot(
    snapshot: EnrollmentPipelineWorkUnitSnapshot | null,
    operatorStage: LifecycleOperatorStage | null
): string[] {
    if (!snapshot) return [];
    if (!isLifecycleStageWorkUnitKey(snapshot.key)) {
        if (!operatorStage) return [];
        return queueStatusKeysForOperatorStage(operatorStage, snapshot);
    }
    const raw = snapshot.queueDefinitionRaw;
    if (!raw || typeof raw !== "object") return [];
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return [];
    const keys: string[] = [];
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const row = q as { key?: unknown; filters?: unknown; filters_compat_v1?: unknown };
        const key = typeof row.key === "string" ? row.key : "";
        if (!key || key === "pipeline_total") continue;
        for (const list of [row.filters_compat_v1, row.filters]) {
            if (!Array.isArray(list)) continue;
            for (const f of list) {
                if (!f || typeof f !== "object") continue;
                const fr = f as { type?: string; values?: unknown };
                const t = String(fr.type ?? "");
                if (t !== "status" && t !== "case_status") continue;
                if (!Array.isArray(fr.values)) continue;
                for (const v of fr.values) {
                    const sk = String(v ?? "").trim();
                    if (sk) keys.push(sk);
                }
            }
        }
    }
    return [...new Set(keys)];
}

/** User-facing empty queue copy for lifecycle stage work units. */
export const LIFECYCLE_STAGE_QUEUE_EMPTY_COPY =
    "No records belong to this lifecycle yet. Create a Lead from this lifecycle to see it here." as const;
