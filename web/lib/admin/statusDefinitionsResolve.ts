import type { SupabaseClient } from "@supabase/supabase-js";

export {
    OPPORTUNITY_LIFECYCLE_STAGES,
    parseLifecycleStageFromMetadata,
    type OpportunityLifecycleStage,
} from "@/lib/admin/statusDefinitionLifecycle";

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
    /** JSON; may include `lifecycle_stage` (canonical pipeline stage for this status_key). */
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
        .in("entity_type", entityType === "opportunities" ? ["opportunities", "opportunity"] : [entityType]);
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
        .in("entity_type", entityType === "opportunities" ? ["opportunities", "opportunity"] : [entityType]);
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
 *
 * **Schedules:** merge industry defaults with org rows by `status_key` (org wins). A lone org subset
 * no longer hides keys like `canceled` that exist only on industry `status_definitions` rows.
 */
export async function fetchEffectiveStatusDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: { activeOnly?: boolean }
): Promise<StatusDefinitionRow[]> {
    // For schedules/opportunities we need *all* org overrides (including inactive) so an inactive org row can
    // explicitly hide an industry default in the effective list.
    const needsMergeDefaults = entityType === "schedules" || entityType === "opportunities";
    const orgRows = await fetchOrgStatusDefinitions(
        supabase,
        orgId,
        entityType,
        needsMergeDefaults ? { activeOnly: false } : opts
    );

    // Schedules (and opportunities) must merge defaults with org rows so a partial org override
    // does not hide industry defaults required by workflows/actions.
    if (needsMergeDefaults) {
        const industryKey = await getOrgIndustryKey(supabase, orgId);
        const defaultRows = await fetchIndustryDefaultStatusDefinitions(supabase, entityType, industryKey, opts);
        const activeOnly = opts?.activeOnly !== false;
        const byKey = new Map<string, StatusDefinitionRow>();
        for (const r of sortDefs(defaultRows)) {
            if (activeOnly && !r.is_active) continue;
            byKey.set(r.status_key, r);
        }
        for (const r of orgRows) {
            if (activeOnly && !r.is_active) {
                byKey.delete(r.status_key);
            } else {
                byKey.set(r.status_key, r);
            }
        }
        return sortDefs(Array.from(byKey.values()));
    }

    if (orgRows.length > 0) return sortDefs(orgRows);
    const industryKey = await getOrgIndustryKey(supabase, orgId);
    return fetchIndustryDefaultStatusDefinitions(supabase, entityType, industryKey, opts);
}

/** Build a map from pre-fetched effective definitions (batch list enrichment). */
export function displayLabelsFromDefinitions(defs: StatusDefinitionRow[]): Map<string, string> {
    return new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string]));
}

export function resolveDisplayFromLabelMap(
    labelByKey: Map<string, string>,
    statusKey: string | null | undefined,
    legacyFallback?: string | null
): string | null {
    const sk = statusKey != null && String(statusKey).trim() !== "" ? String(statusKey).trim() : null;
    if (sk) return labelByKey.get(sk) ?? sk;
    if (legacyFallback != null && String(legacyFallback).trim() !== "") return String(legacyFallback).trim();
    return null;
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

/**
 * Documents table uses `status` (text) as the persisted workflow value — not `status_key`.
 * Value may be a status_definitions key, a human label, or legacy free text.
 */
export function inferDocumentStatusFromStored(
    defs: StatusDefinitionRow[],
    stored: string | null | undefined
): { display: string | null; inferredKey: string | null } {
    if (stored == null || String(stored).trim() === "") return { display: null, inferredKey: null };
    const s = String(stored).trim();
    const byKey = defs.find((d) => d.status_key === s);
    if (byKey) {
        return {
            display: (byKey.status_label?.trim() || byKey.status_key) as string,
            inferredKey: byKey.status_key,
        };
    }
    const byLabel = defs.find((d) => (d.status_label?.trim() ?? "") === s);
    if (byLabel) {
        return {
            display: (byLabel.status_label?.trim() || byLabel.status_key) as string,
            inferredKey: byLabel.status_key,
        };
    }
    return { display: s, inferredKey: null };
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
