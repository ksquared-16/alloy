import type { SupabaseClient } from "@supabase/supabase-js";

const STATUS_DEF_COLUMNS =
    "id, org_id, industry_key, entity_type, status_key, status_label, sort_order, is_active, is_system, metadata";

export type StatusDefinitionRow = {
    id: string;
    org_id: string | null;
    industry_key: string | null;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
    metadata: Record<string, unknown> | null;
};

function sortDefs(rows: StatusDefinitionRow[]): StatusDefinitionRow[] {
    return [...rows].sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        const la = (a.status_label ?? a.status_key ?? "").toLowerCase();
        const lb = (b.status_label ?? b.status_key ?? "").toLowerCase();
        return la.localeCompare(lb);
    });
}

/** Org-specific rows only (org_id = orgId). */
export async function fetchOrgStatusDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: { activeOnly?: boolean }
): Promise<StatusDefinitionRow[]> {
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase
        .from("status_definitions")
        .select(STATUS_DEF_COLUMNS)
        .eq("org_id", orgId)
        .eq("entity_type", entityType);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("sort_order", { ascending: true }).order("status_label", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as StatusDefinitionRow[]).map((r) => ({
        ...r,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }));
}

/**
 * Default rows: org_id IS NULL. Prefer industry-specific definitions over generic (industry_key NULL) per status_key.
 */
export async function fetchIndustryDefaultStatusDefinitions(
    supabase: SupabaseClient,
    entityType: string,
    orgIndustryKey: string | null,
    opts?: { activeOnly?: boolean }
): Promise<StatusDefinitionRow[]> {
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase
        .from("status_definitions")
        .select(STATUS_DEF_COLUMNS)
        .is("org_id", null)
        .eq("entity_type", entityType);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as StatusDefinitionRow[]).map((r) => ({
        ...r,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }));
    const generic = rows.filter((r) => r.industry_key == null || String(r.industry_key).trim() === "");
    const specific = orgIndustryKey
        ? rows.filter((r) => String(r.industry_key ?? "").trim() === orgIndustryKey)
        : [];
    const byKey = new Map<string, StatusDefinitionRow>();
    for (const r of generic) byKey.set(r.status_key, r);
    for (const r of specific) byKey.set(r.status_key, r);
    return sortDefs(Array.from(byKey.values()));
}

/** Resolve org's industry to `industries.key` for matching `status_definitions.industry_key`. */
export async function getOrgIndustryKey(supabase: SupabaseClient, orgId: string): Promise<string | null> {
    const { data } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();
    const industryId = (data as { industry_id?: string | null } | null)?.industry_id ?? null;
    if (!industryId) return null;
    const { data: ind } = await supabase.from("industries").select("key").eq("id", industryId).maybeSingle();
    const k = (ind as { key?: string | null } | null)?.key;
    if (k == null || String(k).trim() === "") return null;
    return String(k).trim();
}

/**
 * Effective definitions for admin UI: org overrides first; if none, industry defaults (merged).
 */
export async function fetchEffectiveStatusDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: { activeOnly?: boolean }
): Promise<StatusDefinitionRow[]> {
    const orgRows = await fetchOrgStatusDefinitions(supabase, orgId, entityType, opts);
    if (orgRows.length > 0) return sortDefs(orgRows);
    const industryKey = await getOrgIndustryKey(supabase, orgId);
    return fetchIndustryDefaultStatusDefinitions(supabase, entityType, industryKey, opts);
}

export async function resolveStatusLabel(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    statusKey: string | null | undefined
): Promise<string | null> {
    if (statusKey == null || String(statusKey).trim() === "") return null;
    const sk = String(statusKey).trim();
    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, { activeOnly: true });
    const hit = defs.find((d) => d.status_key === sk);
    if (hit?.status_label && String(hit.status_label).trim()) return String(hit.status_label).trim();
    return sk;
}

export async function assertAllowedStatusKey(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    statusKey: string | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
    if (statusKey == null || String(statusKey).trim() === "") return { ok: true };
    const sk = String(statusKey).trim();
    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, entityType, { activeOnly: true });
    if (!defs.some((d) => d.status_key === sk)) {
        return { ok: false, message: "status_key is not defined for this entity in status_definitions" };
    }
    return { ok: true };
}
