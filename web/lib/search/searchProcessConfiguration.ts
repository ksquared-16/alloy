/**
 * Alloy Search Platform V2 — the tenant configuration boundary.
 *
 * Search must be agile across tenant configuration. Tenant A configures
 * Enrollment / Annual Registration / Subsidy Renewal; Tenant B configures
 * Admissions / Financial Aid / Summer Camp Registration. **Neither name appears
 * anywhere in Search code.** Both are read from published Business Process
 * configuration through this one module.
 *
 * What configuration is allowed to steer (and does, here):
 *   - which processes exist
 *   - their operator-facing labels
 *   - their stage labels
 *   - whether the operator may reach the owning department
 *
 * What configuration must NEVER do (and cannot, here):
 *   - define arbitrary SQL — this module only reads a parsed, validated payload
 *   - redefine identity — process config never names a subject
 *   - redefine authorization — access is decided by the access envelope, and the
 *     department access flag below can only ever REMOVE a process, never add one
 *   - invent executable navigation or mutation semantics — labels only
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    buildAccessScopeCacheFingerprint,
    departmentIdAllowed,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import {
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

/** One configured Business Process, reduced to what Search needs. */
export type SearchConfiguredProcess = {
    /** Configured `process_key` — matches `process_instances.process_key`. */
    key: string;
    /** Configured operator-facing label, e.g. "Annual Registration". */
    label: string;
    department_id: string;
    /** Configured stage key → configured stage label. */
    stage_labels: Record<string, string>;
    /** False when the operator cannot reach the owning department. */
    operator_has_access: boolean;
};

export type SearchProcessConfiguration = {
    byKey: Map<string, SearchConfiguredProcess>;
    /** Vocabulary for query-intent matching. Access-filtered. */
    vocabulary: Array<{ key: string; label: string }>;
};

/**
 * Short-lived process-configuration cache.
 *
 * Measured on a remote Supabase instance, every round trip costs ~400-500ms and
 * this read sits on the critical path of EVERY keystroke — while the data it
 * returns changes only when an operator publishes a Business Process. Caching it
 * removes roughly a third of search latency.
 *
 * Keyed by org AND access fingerprint, because the vocabulary is access-filtered:
 * two operators with different department scope must never share an entry.
 *
 * The TTL is deliberately short. A freshly published process appears in search
 * within `CONFIG_CACHE_TTL_MS`; nothing here is authoritative, so a briefly stale
 * LABEL is acceptable in a way stale truth never would be.
 */
const CONFIG_CACHE_TTL_MS = 30_000;

type ConfigCacheEntry = { expiresAt: number; value: SearchProcessConfiguration };
const configCache = new Map<string, ConfigCacheEntry>();

/** Test seam — configuration is process-global, so tests must be able to clear it. */
export function resetSearchProcessConfigurationCache(): void {
    configCache.clear();
}

/**
 * Read the tenant's published process configuration.
 *
 * Deliberately ONE query. Departments carry the `lifecycle_builder_v1` payload;
 * parsing is delegated to the canonical config reader so Search never develops
 * its own opinion about the configuration format.
 */
export async function loadSearchProcessConfiguration(
    supabase: SupabaseClient,
    orgId: string,
    dimensions: AdminAccessScopeDimensions,
    options?: { now?: number }
): Promise<SearchProcessConfiguration> {
    const now = options?.now ?? Date.now();
    const cacheKey = `${orgId}::${buildAccessScopeCacheFingerprint(dimensions)}`;
    const cached = configCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await readSearchProcessConfiguration(supabase, orgId, dimensions);
    configCache.set(cacheKey, { expiresAt: now + CONFIG_CACHE_TTL_MS, value });
    return value;
}

async function readSearchProcessConfiguration(
    supabase: SupabaseClient,
    orgId: string,
    dimensions: AdminAccessScopeDimensions
): Promise<SearchProcessConfiguration> {
    const { data, error } = await supabase
        .from("departments")
        .select("id, name, is_active, metadata")
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);

    const byKey = new Map<string, SearchConfiguredProcess>();

    for (const dept of (data ?? []) as Array<{
        id: string;
        is_active?: boolean | null;
        metadata?: unknown;
    }>) {
        if (dept.is_active === false) continue;
        const config = lifecycleBuilderFromDepartmentMetadata(dept.metadata);
        const hasAccess = departmentIdAllowed(dimensions, String(dept.id));

        for (const process of config.processes) {
            if (!process.is_active) continue;
            const key = String(process.key ?? "").trim();
            if (!key) continue;

            const stageLabels: Record<string, string> = {};
            for (const stage of activeStagesForProcess(process)) {
                const stageKey = String(stage.key ?? "").trim();
                const stageLabel = String(stage.label ?? "").trim();
                if (stageKey && stageLabel) stageLabels[stageKey] = stageLabel;
            }

            // First configured definition wins; a later duplicate key does not
            // silently override an operator-accessible one.
            if (byKey.has(key)) continue;
            byKey.set(key, {
                key,
                label: String(process.name ?? "").trim() || key,
                department_id: String(dept.id),
                stage_labels: stageLabels,
                operator_has_access: hasAccess,
            });
        }
    }

    const vocabulary = [...byKey.values()]
        .filter((p) => p.operator_has_access)
        .map((p) => ({ key: p.key, label: p.label }));

    return { byKey, vocabulary };
}

/**
 * Resolve the operator-facing detail for a process instance.
 *
 * Prefers the configured stage label. Falls back to the durable `state`, then to
 * a humanized key — never to a raw key shown as-is where a label was configured.
 */
export function resolveProcessDetail(
    process: SearchConfiguredProcess | undefined,
    stageKey: string | null | undefined,
    state: string | null | undefined
): string | null {
    const sk = String(stageKey ?? "").trim();
    if (sk && process?.stage_labels[sk]) return process.stage_labels[sk];

    const st = String(state ?? "").trim();
    if (st) return humanizeKey(st);
    if (sk) return humanizeKey(sk);
    return null;
}

export function humanizeKey(key: string): string {
    const cleaned = key.replace(/[_-]+/g, " ").trim();
    if (!cleaned) return key;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
