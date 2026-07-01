import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";

/**
 * Ensure an org-owned status_definitions row exists for an opportunity status_key.
 * Copies effective row when only industry default exists.
 */
export async function ensureOrgOpportunityStatusRow(
    supabase: SupabaseClient,
    orgId: string,
    statusKey: string,
    effectiveRow: StatusDefinitionRow
): Promise<{ id: string; metadata: Record<string, unknown> }> {
    const { data: existing } = await supabase
        .from("status_definitions")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("status_key", statusKey)
        .maybeSingle();

    if (existing?.id) {
        const metadata =
            existing.metadata !== null &&
            typeof existing.metadata === "object" &&
            !Array.isArray(existing.metadata)
                ? (existing.metadata as Record<string, unknown>)
                : {};
        return { id: existing.id as string, metadata };
    }

    const insert = {
        org_id: orgId,
        entity_type: "opportunities",
        status_key: statusKey,
        status_label: effectiveRow.status_label,
        sort_order: effectiveRow.sort_order,
        is_active: effectiveRow.is_active,
        is_system: false,
        industry_key: null as string | null,
        metadata: normalizeStatusDefinitionMetadata(effectiveRow.metadata ?? {}),
    };

    const { data: created, error } = await supabase.from("status_definitions").insert(insert).select("id, metadata").single();

    if (error) {
        throw new Error(error.message);
    }

    const metadata =
        created.metadata !== null && typeof created.metadata === "object" && !Array.isArray(created.metadata)
            ? (created.metadata as Record<string, unknown>)
            : {};
    return { id: created.id as string, metadata };
}
