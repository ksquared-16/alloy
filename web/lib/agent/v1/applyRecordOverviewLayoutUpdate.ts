/**
 * Shared apply path for `record_overview_layouts.config` (admin PUT + tests).
 * Agent orchestration uses Postgres RPC (`agentV1CommitRecordOverviewLayoutApply`) for atomic audit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getOverviewLayoutConfigStoredVersion,
    parseOverviewLayoutConfigStrict,
} from "@/lib/rrs/overview/overviewLayoutConfigStrict";

export type ApplyRecordOverviewLayoutPutResult =
    | { ok: true; row: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 409;
          error: string;
          code: "VALIDATION_FAILED" | "STALE_VERSION";
      };

export type PrepareRecordOverviewLayoutPutResult =
    | { ok: true; nextConfig: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 409;
          error: string;
          code: "VALIDATION_FAILED" | "STALE_VERSION";
      };

export function prepareRecordOverviewLayoutPut(
    currentConfigRaw: unknown,
    incoming: unknown,
    expectedVersion: number
): PrepareRecordOverviewLayoutPutResult {
    const currentVersion = getOverviewLayoutConfigStoredVersion(currentConfigRaw);
    if (expectedVersion !== currentVersion) {
        return {
            ok: false,
            status: 409,
            error: "record_overview_layout config version mismatch (stale expected_config_version)",
            code: "STALE_VERSION",
        };
    }

    const parsed = parseOverviewLayoutConfigStrict(incoming);
    if (!parsed.ok) {
        return { ok: false, status: 400, error: parsed.error, code: "VALIDATION_FAILED" };
    }
    return { ok: true, nextConfig: parsed.value };
}

/**
 * Upsert `record_overview_layouts` for org + entity_type + surface.
 * First write: no row → insert when `expected_config_version === 0` (stored version of missing row is 0).
 */
export async function applyRecordOverviewLayoutPut(
    supabase: SupabaseClient,
    orgId: string,
    entityTypeDb: string,
    surface: string,
    input: { config: unknown; expected_config_version: number }
): Promise<ApplyRecordOverviewLayoutPutResult> {
    const { data: existing, error: fetchErr } = await supabase
        .from("record_overview_layouts")
        .select("id, org_id, entity_type, surface, config, template_key, is_active, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", entityTypeDb)
        .eq("surface", surface)
        .maybeSingle();

    if (fetchErr) {
        return { ok: false, status: 400, error: fetchErr.message, code: "VALIDATION_FAILED" };
    }

    const currentRaw = existing?.config ?? {};
    const prep = prepareRecordOverviewLayoutPut(currentRaw, input.config, input.expected_config_version);
    if (!prep.ok) {
        return prep;
    }

    const now = new Date().toISOString();

    if (!existing) {
        const insertPayload = {
            org_id: orgId,
            entity_type: entityTypeDb,
            surface,
            template_key: "default_record_overview",
            config: prep.nextConfig,
            is_active: true,
            updated_at: now,
        };
        const { data: inserted, error: insErr } = await supabase
            .from("record_overview_layouts")
            .insert(insertPayload)
            .select()
            .single();
        if (insErr) {
            return { ok: false, status: 400, error: insErr.message, code: "VALIDATION_FAILED" };
        }
        return { ok: true, row: inserted as Record<string, unknown> };
    }

    const { data: updated, error: updateErr } = await supabase
        .from("record_overview_layouts")
        .update({ config: prep.nextConfig, updated_at: now })
        .eq("id", existing.id)
        .eq("org_id", orgId)
        .select()
        .single();

    if (updateErr) {
        return { ok: false, status: 400, error: updateErr.message, code: "VALIDATION_FAILED" };
    }

    return { ok: true, row: updated as Record<string, unknown> };
}
