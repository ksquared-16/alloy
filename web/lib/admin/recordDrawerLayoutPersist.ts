/**
 * Persist opportunity drawer layout config_json (org override or seed from global template).
 *
 * `onlyIfAbsent` is the provisioning mode (BP V2 D1, `enrollmentDrawerOverrideProvisioning`): it only
 * ever INSERTs and never updates, so an existing override — customized, classic, inactive — cannot be
 * touched by it. The table's UNIQUE (org_id, entity_type, surface, key) arbitrates concurrent callers;
 * the loser gets `code: "already_exists"` and must re-read rather than retry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";

export async function persistOpportunityDrawerLayoutConfig(
    supabase: SupabaseClient,
    orgId: string,
    nextConfig: RecordLayoutConfigJson,
    options: { onlyIfAbsent?: boolean } = {}
): Promise<{ ok: true; created_org_override: boolean } | { ok: false; error: string; code?: "already_exists" }> {
    if (options.onlyIfAbsent) {
        const { error } = await supabase.from("record_drawer_layouts").insert({
            org_id: orgId,
            entity_type: "opportunity",
            surface: "drawer",
            key: "default",
            config_json: nextConfig as Record<string, unknown>,
            is_active: true,
            updated_at: new Date().toISOString(),
        });
        if (error) {
            return (error as { code?: string }).code === "23505"
                ? { ok: false, error: error.message, code: "already_exists" }
                : { ok: false, error: error.message };
        }
        return { ok: true, created_org_override: true };
    }

    const resolved = await fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity");
    if (!resolved.ok) return { ok: false, error: resolved.error };
    if (!resolved.layout) return { ok: false, error: "No effective opportunity drawer layout to edit" };

    const now = new Date().toISOString();

    if (resolved.layout.source === "org_drawer_override" && resolved.layout.record_drawer_layout_id) {
        const { error: upErr } = await supabase
            .from("record_drawer_layouts")
            .update({ config_json: nextConfig as Record<string, unknown>, updated_at: now })
            .eq("id", resolved.layout.record_drawer_layout_id)
            .eq("org_id", orgId);

        if (upErr) return { ok: false, error: upErr.message };
        return { ok: true, created_org_override: false };
    }

    const { error: insErr } = await supabase.from("record_drawer_layouts").insert({
        org_id: orgId,
        entity_type: "opportunity",
        surface: "drawer",
        key: "default",
        config_json: nextConfig as Record<string, unknown>,
        is_active: true,
        updated_at: now,
    });

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, created_org_override: true };
}
