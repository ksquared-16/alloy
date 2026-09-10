/**
 * Load configured field policies for one record, in the two shapes the operator surfaces consume.
 *
 * Both consumers ask the same question — "what does this record still need?" — and must get the
 * same answer, so both are computed from one load and one evaluation:
 *
 *   readiness (record view)   → `ReadinessGap[]`, the proactive "Needs information" list
 *   preflight (blocked action) → `EffectiveRequirementViolation[]`, folded into the blocked panel
 *
 * A field placement is a layout rule, so its violations carry `source: "layout"` and land in the
 * existing layout bucket. Nothing new is invented downstream: the summary copy, the readiness
 * mapper and `ActionPreflightBlockedPanel` all already know how to render this shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import type { DrawerPolicyEntityType } from "@/lib/fields/drawerFieldPolicyAdapter";
import {
    fieldPolicyGapLabel,
    projectFieldPolicyReadinessGaps,
    type FieldPolicyReadinessFieldDef,
} from "@/lib/fields/fieldPolicyReadinessProjection";
import type { EffectiveRequirementViolation } from "@/lib/completion/effectiveRequirementsTypes";
import type { ReadinessGap } from "@/lib/completion/readinessTypes";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const FIELD_DEF_SELECT =
    "id, field_key, field_type, label, is_system, is_required, requirement_policy, interaction_policy";

export type FieldPolicyRequirementInputs = {
    defs: FieldPolicyReadinessFieldDef[];
    layoutConfig: RecordLayoutConfigJson | null;
};

/**
 * Read the field definitions and effective layout that govern one entity type.
 * Never throws — a failed load yields empty inputs, so readiness degrades to today's behavior
 * rather than blocking a record view on a configuration read.
 */
export async function loadFieldPolicyRequirementInputs(
    supabase: SupabaseClient,
    orgId: string,
    entityType: DrawerPolicyEntityType
): Promise<FieldPolicyRequirementInputs> {
    try {
        const [defsRes, layoutRes] = await Promise.all([
            supabase
                .from("field_definitions")
                .select(FIELD_DEF_SELECT)
                .eq("org_id", orgId)
                .eq("entity_type", entityType)
                .eq("is_active", true),
            entityType === "opportunity"
                ? fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity")
                : Promise.resolve(null),
        ]);

        if (defsRes.error) return { defs: [], layoutConfig: null };

        const layoutConfig =
            layoutRes && layoutRes.ok && layoutRes.layout ? layoutRes.layout.config_json : null;

        return { defs: (defsRes.data ?? []) as FieldPolicyReadinessFieldDef[], layoutConfig };
    } catch {
        return { defs: [], layoutConfig: null };
    }
}

/** Unmet field-policy requirements as readiness gaps. */
export function fieldPolicyReadinessGaps(params: {
    inputs: FieldPolicyRequirementInputs;
    entityType: DrawerPolicyEntityType;
    entityId: string;
    record: Record<string, unknown>;
    customValuesByFieldKey?: Record<string, unknown>;
}): ReadinessGap[] {
    return projectFieldPolicyReadinessGaps({
        entityType: params.entityType,
        entityId: params.entityId,
        defs: params.inputs.defs,
        record: params.record,
        customValuesByFieldKey: params.customValuesByFieldKey,
        layoutConfig: params.inputs.layoutConfig,
    });
}

/** The same unmet requirements, as effective-requirement violations for action preflight. */
export function fieldPolicyRequirementViolations(params: {
    inputs: FieldPolicyRequirementInputs;
    entityType: DrawerPolicyEntityType;
    entityId: string;
    record: Record<string, unknown>;
    customValuesByFieldKey?: Record<string, unknown>;
}): EffectiveRequirementViolation[] {
    const defByKey = new Map(params.inputs.defs.map((d) => [d.field_key, d]));
    return fieldPolicyReadinessGaps(params).map((gap) => ({
        field_key: gap.field_key ?? gap.requirement_id,
        label: fieldPolicyGapLabel(defByKey.get(gap.field_key ?? ""), gap.field_key ?? gap.requirement_id),
        severity: "required" as const,
        reason: gap.missing_reason,
        // A placement is a layout rule; this is the bucket it belongs in.
        source: "layout" as const,
        resolution: { type: "field" as const, field_key: gap.field_key },
        entity_type: params.entityType,
        entity_id: params.entityId,
        requirement_level: "enforced" as const,
    }));
}

/** Load and evaluate in one call, for callers that hold no inputs yet. */
export async function loadFieldPolicyRequirementViolations(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        entityType: DrawerPolicyEntityType;
        entityId: string;
        record: Record<string, unknown>;
    }
): Promise<EffectiveRequirementViolation[]> {
    const inputs = await loadFieldPolicyRequirementInputs(supabase, params.orgId, params.entityType);
    if (inputs.defs.length === 0) return [];
    return fieldPolicyRequirementViolations({ inputs, ...params });
}
