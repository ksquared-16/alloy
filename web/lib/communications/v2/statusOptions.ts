/**
 * Communications V2 — status option mapper for the Announcement Audience Builder (B8C).
 *
 * Pure mapping of CONFIGURED status_definitions rows into status-filter options. The audience
 * grain selects the authoritative entity_type:
 *   - family → opportunities.status_key (case/family track)
 *   - child  → opportunity_customer_members.outcome_status_key (child enrollment track)
 *
 * No fixed buckets, no keyword matching — options carry whatever configured metadata exists
 * (stage_key / status_settings_category / process_stage_key) for the operator to choose from.
 * Pure: NO Supabase, NO HTTP.
 */

export const STATUS_OPTION_GRAINS = ["family", "child"] as const;
export type StatusOptionGrain = (typeof STATUS_OPTION_GRAINS)[number];

export type StatusOption = {
    status_key: string;
    label: string;
    entity_type: string;
    stage_key?: string;
    status_settings_category?: string;
    process_stage_key?: string;
};

export type StatusDefinitionRow = {
    org_id: string | null;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    is_active?: boolean | null;
    sort_order?: number | null;
    metadata?: Record<string, unknown> | null;
};

/** Audience grain → the authoritative status_definitions entity_type (null if invalid). */
export function grainToEntityType(grain: string): "opportunities" | "opportunity_customer_members" | null {
    if (grain === "family") return "opportunities";
    if (grain === "child") return "opportunity_customer_members";
    return null;
}

function metaStr(meta: Record<string, unknown>, key: string): string | undefined {
    const v = meta[key];
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Map one status_definitions row to a status option (config metadata passed through verbatim). */
export function mapStatusDefinitionRowToOption(row: StatusDefinitionRow): StatusOption {
    const meta = row.metadata ?? {};
    const opt: StatusOption = {
        status_key: row.status_key,
        label: row.status_label ?? row.status_key,
        entity_type: row.entity_type,
    };
    const stage = metaStr(meta, "stage_key");
    if (stage) opt.stage_key = stage;
    const category = metaStr(meta, "status_settings_category");
    if (category) opt.status_settings_category = category;
    const processStage = metaStr(meta, "process_stage_key");
    if (processStage) opt.process_stage_key = processStage;
    return opt;
}

/**
 * Build the option list from status_definitions rows (org overrides + system/industry defaults).
 * Drops inactive rows and de-dupes by status_key, preferring an org override (org_id != null)
 * over a default. Preserves input order otherwise.
 */
export function buildStatusOptions(rows: StatusDefinitionRow[]): StatusOption[] {
    const byKey = new Map<string, StatusDefinitionRow>();
    for (const r of rows) {
        if (!r || typeof r.status_key !== "string" || r.status_key.length === 0) continue;
        if (r.is_active === false) continue;
        const existing = byKey.get(r.status_key);
        if (!existing) byKey.set(r.status_key, r);
        else if (existing.org_id == null && r.org_id != null) byKey.set(r.status_key, r); // org override wins
    }
    return [...byKey.values()].map(mapStatusDefinitionRowToOption);
}
