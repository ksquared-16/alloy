/**
 * Lifecycle Builder → workspace runtime binding (dept / work-unit / create lead).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { ENROLLMENT_NEW_LEADS_LEGACY_STATUS_ALIASES } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { loadLifecycleStageWorkUnitForDepartment } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { ENROLLMENT_STAGE_QUEUE_KEYS } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    departmentUsesCreateLeadEntryBinding,
    resolveBuilderOwnedLifecycleCreateLeadBinding,
} from "@/lib/lifecycle/lifecycleCreateLeadEntryBinding";

const LEGACY_DEFAULT_PIPELINE_NAME = "enrollment pipeline";

function queueLabelForKey(queueKey: string): string | null {
    const queues = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2.queues;
    if (!Array.isArray(queues)) return null;
    const row = queues.find((q) => q && typeof q === "object" && (q as { key?: string }).key === queueKey);
    const label = row && typeof row === "object" ? (row as { label?: string }).label : null;
    return typeof label === "string" && label.trim() ? label.trim() : null;
}

/** Operator-facing default work unit name (primary lane label, e.g. lead → "New Leads"). */
export function defaultWorkUnitQueueNameForOperatorStage(stage: LifecycleOperatorStage): string {
    const laneKeys = ENROLLMENT_STAGE_QUEUE_KEYS[stage];
    const primaryLane = laneKeys[0];
    if (primaryLane) {
        const label = queueLabelForKey(primaryLane);
        if (label) return label;
    }
    return stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, " ");
}

export function defaultWorkUnitQueueNameForStageKey(stageKey: string): string {
    const operator = asOperatorStageKey(stageKey);
    if (operator) return defaultWorkUnitQueueNameForOperatorStage(operator);
    const trimmed = stageKey.trim();
    return trimmed
        ? trimmed.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Work Unit Queue";
}

/** Status keys written to queue lane filters (includes platform create-lead key on lead stage). */
export function statusKeysForOperatorStageQueueSync(
    stage: LifecycleOperatorStage,
    selectedStatusKeys: readonly string[]
): string[] {
    const out = new Set(selectedStatusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean));
    if (stage === "lead") {
        out.add(NEW_LEAD_STATUS_KEY);
        for (const alias of ENROLLMENT_NEW_LEADS_LEGACY_STATUS_ALIASES) {
            out.add(alias);
        }
    }
    return [...out];
}

export type EnrollmentPipelineWorkUnitRow = {
    id: string;
    key: string;
    name: string;
    department_id: string;
    queue_definition: unknown;
    is_active: boolean;
};

export async function loadEnrollmentPipelineWorkUnitForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<EnrollmentPipelineWorkUnitRow | null> {
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, queue_definition, is_active")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data as EnrollmentPipelineWorkUnitRow;
}

export function activationFromDepartmentMetadata(metadata: unknown): LifecycleActivationV1 | null {
    return lifecycleActivationFromMetadata(metadata);
}

export type LifecycleCreateLeadRuntimeBinding = {
    work_unit_id: string | null;
    status_key: string;
    activation: LifecycleActivationV1 | null;
};

/** Resolve work unit + status for Create Lead on a lifecycle department. */
export async function resolveLifecycleCreateLeadBinding(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<LifecycleCreateLeadRuntimeBinding> {
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();

    const metadata =
        dept?.metadata !== null && typeof dept?.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    if (departmentUsesCreateLeadEntryBinding(metadata)) {
        const entry = await resolveBuilderOwnedLifecycleCreateLeadBinding(
            supabase,
            orgId,
            departmentId,
            metadata
        );
        return {
            work_unit_id: entry.work_unit_id,
            status_key: entry.status_key,
            activation: entry.activation,
        };
    }

    const activation = activationFromDepartmentMetadata(metadata);

    let workUnitId = activation?.work_unit_id?.trim() || null;
    const stageKey = activation?.stage_key?.trim() ?? "";
    if (stageKey) {
        const stageWu = await loadLifecycleStageWorkUnitForDepartment(
            supabase,
            orgId,
            departmentId,
            stageKey
        );
        if (stageWu) workUnitId = stageWu.id;
    }
    if (!workUnitId) {
        const pipeline = await loadEnrollmentPipelineWorkUnitForDepartment(supabase, orgId, departmentId);
        if (pipeline) workUnitId = pipeline.id;
    }

    let statusKey = NEW_LEAD_STATUS_KEY;
    if (activation?.status_keys?.length) {
        statusKey = activation.status_keys[0]!.toLowerCase();
    } else if (activation?.stage_key) {
        const operator = asOperatorStageKey(activation.stage_key);
        if (operator === "lead") {
            statusKey = NEW_LEAD_STATUS_KEY;
        }
    }

    return { work_unit_id: workUnitId, status_key: statusKey, activation };
}

export function isLegacyDefaultPipelineDisplayName(name: string): boolean {
    return name.trim().toLowerCase() === LEGACY_DEFAULT_PIPELINE_NAME;
}
