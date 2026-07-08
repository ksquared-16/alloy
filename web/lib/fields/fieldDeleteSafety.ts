/**
 * Delete safety assessment for custom field_definitions.
 *
 * Implements available dependency scans; documents uncovered consumer surfaces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldDeleteSafetySummary } from "@/lib/fields/fieldLifecycleModel";

export const FIELD_DELETE_UNCOVERED_CHECKS = [
    "focus_panel_configs",
    "queue_row_configs",
    "business_process_requirements",
    "documents_packets",
    "processing_mappings",
] as const;

export type FieldDeleteSafetyInput = {
    id: string;
    org_id: string;
    entity_type: string;
    field_key: string;
};

function jsonReferencesFieldKey(payload: unknown, entityType: string, fieldKey: string): boolean {
    const needle = fieldKey.trim().toLowerCase();
    const entity = entityType.trim().toLowerCase();
    if (!needle) return false;

    const visit = (node: unknown): boolean => {
        if (node == null) return false;
        if (typeof node === "string") {
            return node.trim().toLowerCase() === needle;
        }
        if (Array.isArray(node)) {
            return node.some(visit);
        }
        if (typeof node !== "object") return false;
        const o = node as Record<string, unknown>;
        const fk = typeof o.field_key === "string" ? o.field_key.trim().toLowerCase() : "";
        const et = typeof o.entity_type === "string" ? o.entity_type.trim().toLowerCase() : "";
        if (fk === needle && (!et || et === entity)) return true;
        const refKey = typeof o.refKey === "string" ? o.refKey.trim().toLowerCase() : "";
        if (refKey.endsWith(`.${needle}`) || refKey === `${entity}.${needle}`) return true;
        return Object.values(o).some(visit);
    };

    return visit(payload);
}

async function countFieldValues(
    supabase: SupabaseClient,
    orgId: string,
    fieldDefinitionId: string,
): Promise<number> {
    const { count, error } = await supabase
        .from("field_values")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("field_definition_id", fieldDefinitionId);
    if (error) return 0;
    return count ?? 0;
}

async function scanFormDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    fieldKey: string,
): Promise<number> {
    const { data, error } = await supabase
        .from("form_definitions")
        .select("id, schema_json, draft_schema_json")
        .eq("org_id", orgId);
    if (error || !data?.length) return 0;
    let hits = 0;
    for (const row of data) {
        const r = row as { schema_json?: unknown; draft_schema_json?: unknown };
        if (jsonReferencesFieldKey(r.schema_json, entityType, fieldKey)) hits += 1;
        else if (jsonReferencesFieldKey(r.draft_schema_json, entityType, fieldKey)) hits += 1;
    }
    return hits;
}

async function scanDrawerLayouts(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    fieldKey: string,
): Promise<number> {
    const { data, error } = await supabase
        .from("record_drawer_layouts")
        .select("id, entity_type, config_json")
        .eq("org_id", orgId);
    if (error || !data?.length) return 0;
    const entity = entityType.trim().toLowerCase();
    let hits = 0;
    for (const row of data) {
        const r = row as { entity_type?: string; config_json?: unknown };
        const rowEntity = typeof r.entity_type === "string" ? r.entity_type.trim().toLowerCase() : "";
        if (rowEntity && rowEntity !== entity) continue;
        if (jsonReferencesFieldKey(r.config_json, entityType, fieldKey)) hits += 1;
    }
    return hits;
}

/** Assess whether a custom field_definition may be hard-deleted. */
export async function assessFieldDefinitionDeleteSafety(
    supabase: SupabaseClient,
    field: FieldDeleteSafetyInput,
): Promise<FieldDeleteSafetySummary> {
    const blockers: Array<{ kind: string; label: string; count?: number }> = [];

    const valueCount = await countFieldValues(supabase, field.org_id, field.id);
    if (valueCount > 0) {
        blockers.push({
            kind: "field_values",
            label: `${valueCount} stored value${valueCount === 1 ? "" : "s"} exist.`,
            count: valueCount,
        });
    }

    const formHits = await scanFormDefinitions(supabase, field.org_id, field.entity_type, field.field_key);
    if (formHits > 0) {
        blockers.push({
            kind: "forms",
            label: `Referenced by ${formHits} form${formHits === 1 ? "" : "s"}.`,
            count: formHits,
        });
    }

    const layoutHits = await scanDrawerLayouts(supabase, field.org_id, field.entity_type, field.field_key);
    if (layoutHits > 0) {
        blockers.push({
            kind: "surfaces",
            label: `Referenced by ${layoutHits} drawer layout${layoutHits === 1 ? "" : "s"}.`,
            count: layoutHits,
        });
    }

    const safe = blockers.length === 0;
    return {
        safe,
        blockers,
        uncovered_checks: [...FIELD_DELETE_UNCOVERED_CHECKS],
        recommended_action: safe ? "delete" : valueCount > 0 || formHits > 0 || layoutHits > 0 ? "archive" : "hidden",
    };
}
