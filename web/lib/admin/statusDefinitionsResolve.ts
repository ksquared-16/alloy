import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { logDbTiming } from "@/lib/admin/dbQueryTiming";

const STATUS_EFFECTIVE_CACHE = processMap<string, { at: number; rows: StatusDefinitionRow[]; ttlMs: number }>("status_effective");
/** Process + upstream data cache TTL; overlaps with Next `unstable_cache` revalidate below. */
const STATUS_EFFECTIVE_TTL_MS = 90_000;
const STATUS_EFFECTIVE_CACHE_ENABLED = process.env.NODE_ENV !== "test";

const STATUS_EFFECTIVE_UNSTABLE_TAGS = ["status-definitions-effective"];

export const STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS = STATUS_EFFECTIVE_UNSTABLE_TAGS;

/** Clear in-process effective status cache entries for an org (all entity types / active flags). */
export function invalidateProcessStatusDefinitionsCache(orgId: string): void {
    const prefix = `${orgId.trim()}\u0001`;
    for (const key of [...STATUS_EFFECTIVE_CACHE.keys()]) {
        if (key.startsWith(prefix)) {
            STATUS_EFFECTIVE_CACHE.delete(key);
        }
    }
}

/** Canonical branch names for caches + Postgres merge logic (singular/plural tolerated at call sites). */
export function normalizeEffectiveStatusEntityType(entityType: string): string {
    const t = String(entityType ?? "").trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunities";
    if (t === "schedule" || t === "schedules") return "schedules";
    if (t === "job" || t === "jobs") return "jobs";
    if (t === "opportunity_customer_member" || t === "opportunity_customer_members") {
        return "opportunity_customer_members";
    }
    if (t === "child" || t === "children") return "persons";
    const raw = String(entityType ?? "").trim();
    return raw || t;
}

function entityTypesForStatusQuery(normalizedEntity: string): string[] {
    switch (normalizedEntity) {
        case "opportunities":
            return ["opportunities", "opportunity"];
        case "schedules":
            return ["schedules", "schedule"];
        case "jobs":
            return ["jobs", "job"];
        default:
            return [normalizedEntity];
    }
}

function effectiveStatusDefsUnstableKeyParts(orgId: string, normalizedEntityType: string, activeOnly: boolean): string[] {
    return ["admin-status-def-effective-v2", orgId, normalizedEntityType, activeOnly ? "1" : "0"];
}

type EffectiveStatusDefsPhaseTimings = {
    overrides_ms?: number;
    defaults_ms?: number;
    merge_ms?: number;
    uncached_ms?: number;
};

async function loadEffectiveStatusDefinitionsThroughNextCache(
    orgId: string,
    normalizedEntityType: string,
    opts?: { activeOnly?: boolean; nextRevalidateSeconds?: number },
    phasesOut?: EffectiveStatusDefsPhaseTimings | null
): Promise<{ rows: StatusDefinitionRow[]; fetcherRan: boolean; nextCacheAttempted: boolean }> {
    const activeOnly = opts?.activeOnly !== false;
    const nextRev =
        typeof opts?.nextRevalidateSeconds === "number" && opts.nextRevalidateSeconds >= 60
            ? Math.floor(opts.nextRevalidateSeconds)
            : 90;
    const key = effectiveStatusDefsUnstableKeyParts(orgId, normalizedEntityType, activeOnly);
    let fetcherRan = false;
    const fetcher = async () => {
        fetcherRan = true;
        const client = createAdminClient();
        return fetchEffectiveStatusDefinitionsUncached(client, orgId, normalizedEntityType, opts, phasesOut);
    };
    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        const rows = await unstable_cache(fetcher, key, {
            revalidate: nextRev,
            tags: [...STATUS_EFFECTIVE_UNSTABLE_TAGS, `status-def-org:${orgId}`],
        })();
        return { rows, fetcherRan, nextCacheAttempted: true };
    }
    const rows = await fetcher();
    return { rows, fetcherRan, nextCacheAttempted: false };
}

function statusEffectiveCacheKey(orgId: string, normalizedEntityType: string, activeOnly: boolean): string {
    return `${orgId}\u0001${normalizedEntityType}\u0001${activeOnly ? "1" : "0"}`;
}

export {
    OPPORTUNITY_LIFECYCLE_STAGES,
    parseLifecycleStageFromMetadata,
    type OpportunityLifecycleStage,
} from "@/lib/admin/statusDefinitionLifecycle";
import { processMap } from "@/lib/perf/processCache";

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
    const t0 = Date.now();
    const normalized = normalizeEffectiveStatusEntityType(entityType);
    const entityTypes = entityTypesForStatusQuery(normalized);
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase
        .from("status_definitions")
        .select(STATUS_DEF_COLUMNS)
        .eq("org_id", orgId)
        .in("entity_type", entityTypes);
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order("sort_order", { ascending: true }).order("status_label", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as StatusDefinitionRow[]).map((r) => ({
        ...r,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }));
    logDbTiming("status_definitions.org_select", Date.now() - t0, { orgId, entityType: normalized, activeOnly });
    return rows;
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
    const t0 = Date.now();
    const normalized = normalizeEffectiveStatusEntityType(entityType);
    const entityTypes = entityTypesForStatusQuery(normalized);
    const activeOnly = opts?.activeOnly !== false;
    let q = supabase
        .from("status_definitions")
        .select(STATUS_DEF_COLUMNS)
        .is("org_id", null)
        .in("entity_type", entityTypes);
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
    const out = sortDefs(Array.from(byKey.values()));
    logDbTiming("status_definitions.industry_defaults_select", Date.now() - t0, {
        entityType: normalized,
        activeOnly,
    });
    return out;
}

/** Resolve org's industry to `industries.key` for matching `status_definitions.industry_key`. */
export async function getOrgIndustryKey(supabase: SupabaseClient, orgId: string): Promise<string | null> {
    const t0 = Date.now();
    const { data } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();
    const industryId = (data as { industry_id?: string | null } | null)?.industry_id ?? null;
    if (!industryId) {
        logDbTiming("orgs.industry_key_resolve", Date.now() - t0, { orgId, hit: false });
        return null;
    }
    const { data: ind } = await supabase.from("industries").select("key").eq("id", industryId).maybeSingle();
    const k = (ind as { key?: string | null } | null)?.key;
    if (k == null || String(k).trim() === "") {
        logDbTiming("orgs.industry_key_resolve", Date.now() - t0, { orgId, hit: false });
        return null;
    }
    logDbTiming("orgs.industry_key_resolve", Date.now() - t0, { orgId, hit: true });
    return String(k).trim();
}

/**
 * Effective definitions for admin UI: org overrides first; if none, industry defaults (merged).
 *
 * **Schedules:** merge industry defaults with org rows by `status_key` (org wins). A lone org subset
 * no longer hides keys like `canceled` that exist only on industry `status_definitions` rows.
 */
async function fetchEffectiveStatusDefinitionsUncached(
    supabase: SupabaseClient,
    orgId: string,
    normalizedEntityType: string,
    opts?: { activeOnly?: boolean },
    phasesOut?: EffectiveStatusDefsPhaseTimings | null
): Promise<StatusDefinitionRow[]> {
    const tUnc0 = Date.now();

    // For schedules/opportunities we need *all* org overrides (including inactive) so an inactive org row can
    // explicitly hide an industry default in the effective list.
    const needsMergeDefaults = normalizedEntityType === "schedules" || normalizedEntityType === "opportunities";

    // Schedules (and opportunities) must merge defaults with org rows so a partial org override
    // does not hide industry defaults required by workflows/actions.
    if (needsMergeDefaults) {
        const tOv0 = Date.now();
        const [orgRows, industryKey] = await Promise.all([
            fetchOrgStatusDefinitions(supabase, orgId, normalizedEntityType, { activeOnly: false }),
            getOrgIndustryKey(supabase, orgId),
        ]);
        logDbTiming("status_definitions.merge_parallel_boot", Date.now() - tOv0, {
            orgId,
            entityType: normalizedEntityType,
        });
        if (phasesOut) phasesOut.overrides_ms = Date.now() - tOv0;

        const tDef0 = Date.now();
        const defaultRows = await fetchIndustryDefaultStatusDefinitions(
            supabase,
            normalizedEntityType,
            industryKey,
            opts
        );
        if (phasesOut) phasesOut.defaults_ms = Date.now() - tDef0;

        const tMerge0 = Date.now();
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
        const merged = sortDefs(Array.from(byKey.values()));
        if (phasesOut) phasesOut.merge_ms = Date.now() - tMerge0;
        if (phasesOut) phasesOut.uncached_ms = Date.now() - tUnc0;
        return merged;
    }

    const orgRows = await fetchOrgStatusDefinitions(supabase, orgId, normalizedEntityType, opts);
    if (orgRows.length > 0) {
        if (phasesOut) phasesOut.uncached_ms = Date.now() - tUnc0;
        return sortDefs(orgRows);
    }
    const industryKey = await getOrgIndustryKey(supabase, orgId);
    const out = await fetchIndustryDefaultStatusDefinitions(supabase, normalizedEntityType, industryKey, opts);
    if (phasesOut) phasesOut.uncached_ms = Date.now() - tUnc0;
    return out;
}

/** Sub-timings from the uncached Postgres merge path (null phases when served from Next data cache without running fetcher). */
export type StatusDefsResolveTelemetry = {
    normalized_entity_type: string;
    process_cache_hit: boolean;
    next_cache_attempted: boolean;
    /** True when Next `unstable_cache` returned a cached value without invoking the fetcher. */
    next_cache_hit: boolean;
    /** Wall time of uncached merge + queries when the fetcher ran; 0 on full cache hits. */
    uncached_ms: number;
    overrides_ms: number | null;
    defaults_ms: number | null;
    merge_ms: number | null;
};

export type EffectiveStatusDefinitionsPack = {
    rows: StatusDefinitionRow[];
    /**
     * True when served from this Node process in-memory cache (sub-ms). `false` includes cold path,
     * test mode, Next `unstable_cache` hits, or first population after TTL — see also `combinedCacheHit`.
     */
    processCacheHit: boolean;
    /** True when either the process cache or Next `unstable_cache` avoided running the uncached merge this request. */
    combinedCacheHit: boolean;
    telemetry: StatusDefsResolveTelemetry;
};

function emptyStatusDefsTelemetry(normalized: string, processHit: boolean): StatusDefsResolveTelemetry {
    return {
        normalized_entity_type: normalized,
        process_cache_hit: processHit,
        next_cache_attempted: false,
        next_cache_hit: false,
        uncached_ms: 0,
        overrides_ms: null,
        defaults_ms: null,
        merge_ms: null,
    };
}

/**
 * Effective merged definitions — same semantics as {@link fetchEffectiveStatusDefinitions}.
 * Layers: short-TTL **process** map then Next **Data Cache** via `unstable_cache` (90s), then Postgres merge.
 * Cache keys use {@link normalizeEffectiveStatusEntityType} so `opportunity` / `opportunities` share one entry.
 */
export type FetchEffectiveStatusDefinitionsTaggedOpts = {
    activeOnly?: boolean;
    /**
     * In-process LRU TTL (ms). Larger values help warm staging/prod bursts where unrelated traffic
     * evicts Lambda less often — effective defs still refresh via Postgres on expiry.
     * Default {@link STATUS_EFFECTIVE_TTL_MS}.
     */
    processLruTtlMs?: number;
    /** Next.js `unstable_cache` `revalidate` seconds for this entity (min 60). Default 90. */
    nextRevalidateSeconds?: number;
};

export async function fetchEffectiveStatusDefinitionsTagged(
    _supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: FetchEffectiveStatusDefinitionsTaggedOpts
): Promise<EffectiveStatusDefinitionsPack> {
    const normalized = normalizeEffectiveStatusEntityType(entityType);
    const activeOnly = opts?.activeOnly !== false;
    const processTtlMs = typeof opts?.processLruTtlMs === "number" && opts.processLruTtlMs >= 5000 ? opts.processLruTtlMs : STATUS_EFFECTIVE_TTL_MS;
    if (STATUS_EFFECTIVE_CACHE_ENABLED) {
        const ck = statusEffectiveCacheKey(orgId, normalized, activeOnly);
        const ent = STATUS_EFFECTIVE_CACHE.get(ck);
        const now = Date.now();
        if (ent && now - ent.at < ent.ttlMs) {
            return {
                rows: ent.rows,
                processCacheHit: true,
                combinedCacheHit: true,
                telemetry: emptyStatusDefsTelemetry(normalized, true),
            };
        }
    }
    const phases: EffectiveStatusDefsPhaseTimings = {};
    const { rows, fetcherRan, nextCacheAttempted } = await loadEffectiveStatusDefinitionsThroughNextCache(
        orgId,
        normalized,
        { activeOnly, nextRevalidateSeconds: opts?.nextRevalidateSeconds },
        phases
    );
    const nextCacheHit = nextCacheAttempted && !fetcherRan;
    if (STATUS_EFFECTIVE_CACHE_ENABLED) {
        STATUS_EFFECTIVE_CACHE.set(statusEffectiveCacheKey(orgId, normalized, activeOnly), {
            at: Date.now(),
            rows,
            ttlMs: processTtlMs,
        });
    }
    const uncachedMs = typeof phases.uncached_ms === "number" ? phases.uncached_ms : 0;
    return {
        rows,
        processCacheHit: false,
        combinedCacheHit: nextCacheHit,
        telemetry: {
            normalized_entity_type: normalized,
            process_cache_hit: false,
            next_cache_attempted: nextCacheAttempted,
            next_cache_hit: nextCacheHit,
            uncached_ms: uncachedMs,
            overrides_ms: typeof phases.overrides_ms === "number" ? phases.overrides_ms : null,
            defaults_ms: typeof phases.defaults_ms === "number" ? phases.defaults_ms : null,
            merge_ms: typeof phases.merge_ms === "number" ? phases.merge_ms : null,
        },
    };
}

/**
 * Effective definitions without Next/process caches — for CLI inventory and other non-request contexts.
 */
export async function fetchEffectiveStatusDefinitionsDirect(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: { activeOnly?: boolean }
): Promise<StatusDefinitionRow[]> {
    const normalized = normalizeEffectiveStatusEntityType(entityType);
    return fetchEffectiveStatusDefinitionsUncached(supabase, orgId, normalized, opts);
}

/**
 * Effective definitions for admin UI: org overrides first; if none, industry defaults (merged for schedules/opportunities).
 * Short TTL in-process cache (org + entity + activeOnly); disabled in test to avoid cross-example staleness.
 */
export async function fetchEffectiveStatusDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    opts?: FetchEffectiveStatusDefinitionsTaggedOpts
): Promise<StatusDefinitionRow[]> {
    const pack = await fetchEffectiveStatusDefinitionsTagged(supabase, orgId, entityType, opts);
    return pack.rows;
}

/** Build a map from pre-fetched effective definitions (batch list enrichment). */
export function displayLabelsFromDefinitions(defs: StatusDefinitionRow[]): Map<string, string> {
    return new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string]));
}

/**
 * The configured default-on-create status for an entity, if the status configuration designates
 * one. Config point: a `status_definitions` row whose `metadata.default_on_create === true`. This
 * is how the opportunity status configuration OWNS the Create Lead status — Create Lead reads this
 * rather than hardcoding a status key. Returns null when no status is flagged (caller falls back to
 * the canonical durable default, never to a hardcoded pipeline key). When multiple rows are flagged
 * (misconfiguration) the lowest sort_order wins, matching the configured display order.
 */
export function resolveConfiguredDefaultCreateStatusKey(defs: StatusDefinitionRow[]): string | null {
    const flagged = defs.filter((d) => {
        const md = d.metadata;
        return (
            md != null &&
            typeof md === "object" &&
            (md as { default_on_create?: unknown }).default_on_create === true &&
            typeof d.status_key === "string" &&
            d.status_key.trim() !== ""
        );
    });
    if (!flagged.length) return null;
    const winner = sortDefs(flagged)[0];
    return winner ? winner.status_key.trim() : null;
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
