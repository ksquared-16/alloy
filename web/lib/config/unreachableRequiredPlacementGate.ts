/**
 * Publication gate: a required field must be reachable on the layout that requires it.
 *
 * `validateLayoutIntegrity` already reports `required_on_layout_not_visible` and
 * `required_field_not_visible`. It reported them read-only, after the fact, on a Configuration
 * Health page nobody is looking at while publishing — so a placement that made `source` required on
 * a surface it could not be edited on went live and froze every opportunity in the tenant against
 * every write.
 *
 * This runs the SAME validator against the merged config at the moment of publication, so the
 * condition is caught while it is still a settings change rather than an outage. No second
 * validator, no second rule set — only an earlier reading of the existing one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    validateLayoutIntegrityNow,
    type LayoutIntegrityFieldInput,
} from "@/lib/config/layoutIntegrityValidator";
import type { LayoutIntegrityIssue } from "@/lib/config/layoutIntegrityTypes";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/** Issue codes that mean "required, but the operator has nowhere to enter it". */
export const UNREACHABLE_REQUIRED_ISSUE_CODES = [
    "required_on_layout_not_visible",
    "required_field_not_visible",
] as const;

export function isUnreachableRequiredIssue(issue: LayoutIntegrityIssue): boolean {
    return (UNREACHABLE_REQUIRED_ISSUE_CODES as readonly string[]).includes(issue.code);
}

/**
 * Issues the pending config would introduce for the fields being changed.
 *
 * Scoped to `fieldKeys` on purpose: an admin editing one field must not be blocked by a pre-existing
 * problem on another. Never throws — a failed read returns no issues, so a configuration change is
 * never blocked by an inability to check it.
 */
export async function unreachableRequiredPlacementIssues(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        entityType: string;
        mergedConfig: RecordLayoutConfigJson;
        fieldKeys: string[];
    }
): Promise<LayoutIntegrityIssue[]> {
    const wanted = new Set(params.fieldKeys.map((k) => k.trim()).filter(Boolean));
    if (wanted.size === 0) return [];

    try {
        const [fieldRes, sectionRes] = await Promise.all([
            supabase
                .from("field_definitions")
                .select(
                    "field_key, entity_type, field_type, is_active, is_system, is_required, requirement_policy, interaction_policy, is_visible_in_form, is_visible_in_drawer, is_visible_in_table, is_visible_in_public_booking, section_key, config"
                )
                .eq("org_id", params.orgId)
                .eq("entity_type", params.entityType),
            supabase
                .from("field_section_definitions")
                .select("section_key, entity_type, is_archived, section_config")
                .eq("org_id", params.orgId)
                .eq("entity_type", params.entityType),
        ]);

        if (fieldRes.error || !fieldRes.data) return [];

        const field_definitions = fieldRes.data.map((r) => {
            const row = r as Record<string, unknown>;
            return {
                field_key: String(row.field_key),
                entity_type: String(row.entity_type),
                field_type: String(row.field_type),
                is_active: row.is_active !== false,
                is_system: Boolean(row.is_system),
                is_required: Boolean(row.is_required),
                requirement_policy: row.requirement_policy,
                interaction_policy: row.interaction_policy,
                is_visible_in_form: row.is_visible_in_form !== false,
                is_visible_in_drawer: row.is_visible_in_drawer !== false,
                is_visible_in_table: Boolean(row.is_visible_in_table),
                is_visible_in_public_booking: Boolean(row.is_visible_in_public_booking),
                section_key: (row.section_key ?? null) as string | null,
                config: row.config,
            } satisfies LayoutIntegrityFieldInput;
        });

        const report = validateLayoutIntegrityNow({
            entity_type: params.entityType,
            field_definitions,
            sections: (sectionRes.data ?? []).map((s) => {
                const row = s as Record<string, unknown>;
                return {
                    section_key: String(row.section_key),
                    entity_type: String(row.entity_type),
                    is_archived: Boolean(row.is_archived),
                    section_config: row.section_config,
                };
            }),
            layout_config_json: params.mergedConfig,
        });

        return report.issues.filter(
            (issue) => isUnreachableRequiredIssue(issue) && issue.field_key != null && wanted.has(issue.field_key)
        );
    } catch {
        return [];
    }
}
