/**
 * Overview layout v0: pure model re-exports + admin DB loaders.
 * @see overviewLayoutConfigModel.ts for client-safe parsing (no Supabase).
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import type { RecordOverviewLayoutRow } from "@/lib/rrs/types";
import {
    getDefaultOverviewLayoutConfig,
    parseOverviewLayoutConfig,
    type OverviewLayoutConfigV0,
} from "./overviewLayoutConfigModel";

export * from "./overviewLayoutConfigModel";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Load active layout row for org + entity_type + surface; admin client bypasses RLS. */
export async function loadRecordOverviewLayoutRow(
    supabase: AdminSupabase,
    orgId: string,
    entityType: string,
    surface: string
): Promise<RecordOverviewLayoutRow | null> {
    const { data, error } = await supabase
        .from("record_overview_layouts")
        .select("id, org_id, entity_type, surface, template_key, config, is_active")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("surface", surface)
        .eq("is_active", true)
        .maybeSingle();
    if (error || !data) return null;
    return data as RecordOverviewLayoutRow;
}

/** Effective parsed config: DB row or defaults. */
export async function loadEffectiveOverviewLayoutConfig(
    supabase: AdminSupabase,
    orgId: string,
    entityType: string,
    surface: string
): Promise<{ row: RecordOverviewLayoutRow | null; config: OverviewLayoutConfigV0 }> {
    const row = await loadRecordOverviewLayoutRow(supabase, orgId, entityType, surface);
    if (!row) return { row: null, config: getDefaultOverviewLayoutConfig() };
    return { row, config: parseOverviewLayoutConfig(row.config) };
}
