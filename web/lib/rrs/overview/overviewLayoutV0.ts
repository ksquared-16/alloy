import { createAdminClient } from "@/lib/supabaseAdmin";
import type { RecordOverviewLayoutRow } from "@/lib/rrs/types";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/** One band in overview config JSON (v0). */
export type OverviewLayoutBandV0 = {
    band_key: "summary" | "people" | "operational" | "financial" | "relationships";
    enabled: boolean;
    items: Array<{
        kind: "system_field" | "custom_field" | "section";
        key: string;
        hint?: { span?: 1 | 2 | 3 };
    }>;
};

/** Parsed overview layout `config` column (v0). */
export type OverviewLayoutConfigV0 = {
    bands: OverviewLayoutBandV0[];
    header_keys: string[];
};

const DEFAULT_OVERVIEW_LAYOUT: OverviewLayoutConfigV0 = {
    header_keys: ["title", "status_key", "_customer_name", "_primary_person_name", "_work_unit_label"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [
                { kind: "system_field", key: "scheduled_at" },
                { kind: "system_field", key: "_next_schedule" },
                { kind: "system_field", key: "_location_label" },
            ],
        },
        {
            band_key: "people",
            enabled: true,
            items: [{ kind: "system_field", key: "_primary_person_name" }],
        },
        {
            band_key: "financial",
            enabled: true,
            items: [
                { kind: "system_field", key: "display_total_cents" },
                { kind: "system_field", key: "_discount_applied" },
            ],
        },
        { band_key: "operational", enabled: false, items: [] },
        { band_key: "relationships", enabled: false, items: [] },
    ],
};

function isBandKey(s: string): s is OverviewLayoutBandV0["band_key"] {
    return ["summary", "people", "operational", "financial", "relationships"].includes(s);
}

/** Best-effort parse of DB jsonb; invalid shapes fall back to defaults. */
export function parseOverviewLayoutConfig(raw: unknown): OverviewLayoutConfigV0 {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    }
    const o = raw as Record<string, unknown>;
    const header_keys = Array.isArray(o.header_keys) ? o.header_keys.filter((x) => typeof x === "string") : DEFAULT_OVERVIEW_LAYOUT.header_keys;
    const bandsIn = Array.isArray(o.bands) ? o.bands : [];
    const bands: OverviewLayoutBandV0[] = [];
    for (const b of bandsIn) {
        if (b == null || typeof b !== "object" || Array.isArray(b)) continue;
        const bk = (b as { band_key?: string }).band_key;
        if (!bk || !isBandKey(bk)) continue;
        const enabled = Boolean((b as { enabled?: boolean }).enabled);
        const itemsRaw = Array.isArray((b as { items?: unknown }).items) ? (b as { items: unknown[] }).items : [];
        const items: OverviewLayoutBandV0["items"] = [];
        for (const it of itemsRaw) {
            if (it == null || typeof it !== "object") continue;
            const kind = (it as { kind?: string }).kind;
            const key = (it as { key?: string }).key;
            if (kind !== "system_field" && kind !== "custom_field" && kind !== "section") continue;
            if (typeof key !== "string" || !key.trim()) continue;
            items.push({ kind, key: key.trim(), hint: undefined });
        }
        bands.push({ band_key: bk, enabled, items });
    }
    if (bands.length === 0) return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    return { header_keys, bands };
}

export function getDefaultOverviewLayoutConfig(): OverviewLayoutConfigV0 {
    return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
}

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
