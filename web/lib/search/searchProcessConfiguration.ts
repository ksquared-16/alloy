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
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

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
    /**
     * The process's configured Work Views — the operational cohorts a subject can BELONG to.
     *
     * Read through the canonical reader so Search sees exactly the lens set the runtime serves
     * (display order normalized, orphaned lifecycle views dropped). Populated only for the
     * department's ACTIVE process: a non-active process has no runtime surface to send anyone to, so
     * offering its lenses would be offering a destination that cannot exist.
     */
    work_views: WorkViewConfigV1Stored[];
    /**
     * The process's active stages, carrying `grain` and `stage_operating_plan_v1` — needed to resolve
     * a lens's Row Grain and to ask whether a subject can actually compose there. Same set, same
     * order, as the runtime resolves.
     */
    stages: LifecycleBuilderStageRecord[];
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

        // Work Views belong to the department's ACTIVE process — that is the only process the
        // runtime composes a surface for. Resolved once per department, not once per process.
        const activeProcess = activeLifecycleProcess(config);
        const activeProcessKey = String(activeProcess?.key ?? "").trim();
        const activeProcessWorkViews = activeProcess
            ? savedWorkViewsFromDepartmentMetadata(dept.metadata)
            : [];

        for (const process of config.processes) {
            if (!process.is_active) continue;
            const key = String(process.key ?? "").trim();
            if (!key) continue;

            const stages = activeStagesForProcess(process);
            const stageLabels: Record<string, string> = {};
            for (const stage of stages) {
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
                work_views: activeProcessKey && key === activeProcessKey ? activeProcessWorkViews : [],
                stages,
            });
        }
    }

    // Vocabulary = the processes an operator can name, PLUS the Work Views they can name.
    //
    // "Lennon waitlist" should promote the Waitlist cohort, and a Work View label is the operator's
    // own word for it. The promoted key is the DESTINATION key verbatim, so intent matching needs no
    // new rule — `destinationMatchesPromotedKey` already compares keys exactly.
    //
    // Ranking only. A promoted key reorders destinations that membership evaluation already found
    // truthful; naming a cohort in a query can never make someone a member of it.
    const vocabulary: Array<{ key: string; label: string }> = [];
    for (const p of byKey.values()) {
        if (!p.operator_has_access) continue;
        vocabulary.push({ key: p.key, label: p.label });
        for (const view of p.work_views) {
            if (view.visible_in_runtime === false) continue;
            const label = String(view.label ?? "").trim();
            if (label) vocabulary.push({ key: `work_view:${p.key}:${view.id}`, label });
        }
    }

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
