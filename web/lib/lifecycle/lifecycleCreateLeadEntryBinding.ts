/**
 * Create Lead runtime binding for builder-owned lifecycles.
 * Uses process stages + status mappings + lifecycle_wu rows — not lifecycle_activation_v1.stage_key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    activeLifecycleProcess,
    asOperatorStageKey,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    buildEnrollmentStatusStagesPayload,
    type EnrollmentStatusStagesPayload,
} from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    listLifecycleStageWorkUnitsForDepartment,
    loadLifecycleStageWorkUnitForDepartment,
    stageKeyFromLifecycleWorkUnitMetadata,
    type LifecycleStageWorkUnitRow,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";
import { queueStatusKeysForLifecycleWorkUnitValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleStageWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export type LifecycleCreateLeadEntryBinding = {
    work_unit_id: string | null;
    status_key: string;
    entry_stage_key: string | null;
    activation: LifecycleActivationV1 | null;
};

export type CreateLeadStageWorkUnitRef = {
    metadata?: unknown;
    queue_definition?: unknown;
    key?: string | null;
};

function normalizeStatusKey(key: string): string {
    return key.trim().toLowerCase();
}

/** Status keys configured for a stage (Settings mappings, WU metadata, queue_definition). */
export function collectStatusKeysForCreateLeadStage(
    stageKey: string,
    statusPayload: EnrollmentStatusStagesPayload | null,
    workUnit?: CreateLeadStageWorkUnitRef | null
): string[] {
    const out = new Set<string>();

    for (const k of stageSavedStatusKeys(statusPayload, stageKey)) {
        const n = normalizeStatusKey(k);
        if (n) out.add(n);
    }

    if (workUnit?.metadata != null && typeof workUnit.metadata === "object" && !Array.isArray(workUnit.metadata)) {
        const fromMeta = (workUnit.metadata as LifecycleStageWorkUnitMetadata).status_keys;
        if (Array.isArray(fromMeta)) {
            for (const k of fromMeta) {
                const n = normalizeStatusKey(String(k ?? ""));
                if (n) out.add(n);
            }
        }
    }

    if (workUnit?.queue_definition != null && workUnit.key) {
        for (const k of queueStatusKeysForLifecycleWorkUnitValidation(
            {
                id: "entry-binding",
                key: workUnit.key,
                name: workUnit.key,
                is_active: true,
                queue_definition: workUnit.queue_definition,
            },
            stageKey
        )) {
            out.add(normalizeStatusKey(k));
        }
    }

    const operator = asOperatorStageKey(stageKey);
    if (operator === "lead") {
        out.add(normalizeStatusKey(NEW_LEAD_STATUS_KEY));
    }

    return [...out];
}

export function stageOwnsCreateLeadStatus(statusKeys: readonly string[]): boolean {
    const needle = normalizeStatusKey(NEW_LEAD_STATUS_KEY);
    return statusKeys.some((k) => normalizeStatusKey(k) === needle);
}

/**
 * The active stage that owns Create Lead entry. Post-collapse the entry stage is the LEAD operator
 * stage (position is the stage, not a status), so that is the primary signal. Falls back to the
 * legacy heuristic (a stage whose configured statuses include `new_inquiry`) for configs that
 * predate operator-stage keys, then to the first active stage by sort order.
 */
export function resolveCreateLeadEntryStageKey(params: {
    stages: readonly LifecycleBuilderStageRecord[];
    statusPayload: EnrollmentStatusStagesPayload | null;
    workUnitByStageKey: ReadonlyMap<string, CreateLeadStageWorkUnitRef>;
}): string | null {
    const active = [...params.stages]
        .filter((s) => s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));

    // Primary: the LEAD operator stage owns Create Lead entry.
    for (const stage of active) {
        if (asOperatorStageKey(stage.key) === "lead") return stage.key;
    }

    // Legacy fallback: a stage whose configured statuses include the legacy new_inquiry key.
    for (const stage of active) {
        const keys = collectStatusKeysForCreateLeadStage(
            stage.key,
            params.statusPayload,
            params.workUnitByStageKey.get(stage.key) ?? null
        );
        if (stageOwnsCreateLeadStatus(keys)) return stage.key;
    }

    return active[0]?.key ?? null;
}

function workUnitByStageKeyFromRows(
    rows: readonly LifecycleStageWorkUnitRow[]
): Map<string, CreateLeadStageWorkUnitRef> {
    const map = new Map<string, CreateLeadStageWorkUnitRef>();
    for (const wu of rows) {
        const stageKey =
            stageKeyFromLifecycleWorkUnitMetadata(wu.metadata) ??
            (wu.key.startsWith("lifecycle_wu_") ? wu.key.slice("lifecycle_wu_".length) : "");
        if (stageKey) {
            map.set(stageKey, {
                key: wu.key,
                metadata: wu.metadata,
                queue_definition: wu.queue_definition,
            });
        }
    }
    return map;
}

async function loadStatusPayloadForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    stageKeys: readonly string[]
): Promise<EnrollmentStatusStagesPayload> {
    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    return buildEnrollmentStatusStagesPayload(
        statusRows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeys.length ? stageKeys : undefined
    );
}

/** Builder-owned Create Lead: entry stage from config, always `new_inquiry` status. */
export async function resolveBuilderOwnedLifecycleCreateLeadBinding(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    departmentMetadata: unknown
): Promise<LifecycleCreateLeadEntryBinding> {
    const activation = lifecycleActivationFromMetadata(departmentMetadata);
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stages = process?.stages ?? [];
    const stageKeys = stages.map((s) => s.key);

    const [statusPayload, lifecycleWus] = await Promise.all([
        loadStatusPayloadForDepartment(supabase, orgId, stageKeys),
        listLifecycleStageWorkUnitsForDepartment(supabase, orgId, departmentId),
    ]);

    const workUnitByStageKey = workUnitByStageKeyFromRows(lifecycleWus);
    const entryStageKey = resolveCreateLeadEntryStageKey({
        stages,
        statusPayload,
        workUnitByStageKey,
    });

    let workUnitId: string | null = null;
    if (entryStageKey) {
        const stageWu = await loadLifecycleStageWorkUnitForDepartment(
            supabase,
            orgId,
            departmentId,
            entryStageKey
        );
        workUnitId = stageWu?.id ?? null;
    }

    // Operator-configured status for the entry stage (excluding the legacy new_inquiry sentinel);
    // empty when none configured — Create Lead resolves the configured default / canonical status.
    const entryStatusKey = entryStageKey
        ? stageSavedStatusKeys(statusPayload, entryStageKey)
              .map((k) => normalizeStatusKey(k))
              .find((k) => k && k !== normalizeStatusKey(NEW_LEAD_STATUS_KEY)) ?? ""
        : "";

    return {
        work_unit_id: workUnitId,
        status_key: entryStatusKey,
        entry_stage_key: entryStageKey,
        activation,
    };
}

export function departmentUsesCreateLeadEntryBinding(metadata: unknown): boolean {
    return isLifecycleBuilderOwnedDepartmentMetadata(metadata);
}
