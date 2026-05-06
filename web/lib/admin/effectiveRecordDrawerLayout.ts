/**
 * Effective admin record drawer layout — same DB resolution as `GET /api/admin/record-layouts`.
 * Used by that route and by `record-layouts/effective-preview` for Card 8 provenance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type EffectiveDrawerLayoutSource = "org_drawer_override" | "global_template";

export type EffectiveRecordDrawerLayoutRow = {
    source: EffectiveDrawerLayoutSource;
    /** Populated when `source === "org_drawer_override"` */
    record_drawer_layout_id: string | null;
    /** Populated when `source === "global_template"` */
    record_layout_id: string | null;
    /** Effective row key (always `default` for org override path today). */
    key: string;
    entity_type: string;
    config_json: RecordLayoutConfigJson;
    is_active: boolean;
    created_at: string;
    /** Global templates considered when falling back (1 once chosen). */
    global_template_count: number | null;
};

export async function fetchEffectiveRecordDrawerLayout(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string
): Promise<{ ok: true; layout: EffectiveRecordDrawerLayoutRow | null } | { ok: false; error: string }> {
    const { data: orgRow, error: orgErr } = await supabase
        .from("record_drawer_layouts")
        .select("id, org_id, entity_type, surface, key, config_json, is_active, created_at, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("surface", "drawer")
        .eq("key", "default")
        .eq("is_active", true)
        .maybeSingle();

    if (orgErr) {
        return { ok: false, error: orgErr.message };
    }

    if (orgRow) {
        const layout: EffectiveRecordDrawerLayoutRow = {
            source: "org_drawer_override",
            record_drawer_layout_id: orgRow.id as string,
            record_layout_id: null,
            key: String(orgRow.key ?? "default"),
            entity_type: String(orgRow.entity_type ?? entityType),
            config_json: ((orgRow as { config_json?: RecordLayoutConfigJson }).config_json ?? {}) as RecordLayoutConfigJson,
            is_active: Boolean((orgRow as { is_active?: boolean }).is_active),
            created_at: (orgRow as { created_at?: string }).created_at ?? new Date().toISOString(),
            global_template_count: null,
        };
        return { ok: true, layout };
    }

    const { data, error } = await supabase
        .from("record_layouts")
        .select("id, entity_type, key, config_json, is_active, created_at")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

    if (error) {
        return { ok: false, error: error.message };
    }

    const rows = data ?? [];
    const picked = rows.find((r) => r.key === "default") ?? rows[0];
    if (!picked) {
        return { ok: true, layout: null };
    }

    const layout: EffectiveRecordDrawerLayoutRow = {
        source: "global_template",
        record_drawer_layout_id: null,
        record_layout_id: picked.id as string,
        key: String(picked.key ?? "default"),
        entity_type: String(picked.entity_type ?? entityType),
        config_json: (picked.config_json ?? {}) as RecordLayoutConfigJson,
        is_active: Boolean(picked.is_active),
        created_at: String(picked.created_at ?? new Date().toISOString()),
        global_template_count: rows.length,
    };
    return { ok: true, layout };
}
