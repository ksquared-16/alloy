import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkUnitRouteSlugRow } from "@/lib/admin/resolveWorkUnitByRouteSlug";

/**
 * The work unit's department is EMBEDDED, not fetched afterwards.
 *
 * Route identity needed both, and the departments read could only start once the work-unit rows
 * named their department ids — a second serial round trip on the document critical path, inside
 * `route_meta` (~2.1s), which is paid before the first byte.
 *
 * `org_id` is selected on the embedded row deliberately: the standalone departments read asserted
 * `.eq("org_id", orgId)`, and that explicit tenant guard is re-applied in memory below rather than
 * being downgraded to "the FK implies it".
 */
const SLUG_WU_SELECT =
    "id, org_id, department_id, key, name, sort_order, is_active, queue_definition, departments(id, org_id, key, name, metadata)";

/** Avoid PostgrestFilterBuilder deep-instantiation (matches accessScope query helpers). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDepartmentScope(query: any, dim: AdminAccessScopeDimensions): any {
    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.length) return query;
        return query.in("department_id", allowed);
    }
    return query;
}

/**
 * Departments carried on the embedded work-unit rows, with the SAME explicit `org_id` assertion the
 * standalone read used. PostgREST returns the embed as an object (to-one) — normalised here.
 */
function embeddedDepartments(data: unknown[] | null, orgId: string): SlugResolutionDepartmentRow[] {
    const byId = new Map<string, SlugResolutionDepartmentRow>();
    for (const row of data ?? []) {
        const embed = (row as { departments?: unknown }).departments;
        for (const dept of Array.isArray(embed) ? embed : embed ? [embed] : []) {
            const d = dept as { id?: unknown; org_id?: unknown; key?: unknown; name?: unknown; metadata?: unknown };
            if (typeof d.id !== "string") continue;
            // The explicit tenant guard, preserved rather than downgraded to "the FK implies it".
            if (typeof d.org_id === "string" && d.org_id !== orgId) continue;
            byId.set(d.id, {
                id: d.id,
                key: (d.key as string | null) ?? null,
                name: (d.name as string | null) ?? null,
                metadata: d.metadata ?? null,
            });
        }
    }
    return [...byId.values()];
}

function mapRows(data: unknown[] | null): WorkUnitRouteSlugRow[] {
    return (data ?? []).map((row) => {
        const r = row as {
            id: string;
            department_id: string;
            key: string;
            name: string;
            queue_definition: unknown;
            sort_order?: number | null;
            is_active?: boolean | null;
        };
        return {
            id: r.id,
            department_id: r.department_id,
            key: r.key,
            name: r.name,
            queue_definition: r.queue_definition,
            sort_order: r.sort_order,
            is_active: r.is_active,
        };
    });
}

function dedupeRows(rows: WorkUnitRouteSlugRow[]): WorkUnitRouteSlugRow[] {
    const seen = new Set<string>();
    const out: WorkUnitRouteSlugRow[] = [];
    for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
}

/**
 * Bounded work-unit fetch for slug resolution.
 * 1) Direct key match  2) Lifecycle stage keys  3) Org-wide fallback (queue-lane slugs only).
 */
export async function fetchWorkUnitsForSlugResolution(params: {
    supabase: SupabaseClient;
    orgId: string;
    dim: AdminAccessScopeDimensions;
    platformKey: string;
}): Promise<{
    rows: WorkUnitRouteSlugRow[];
    strategy: "direct" | "lifecycle" | "org_scan";
    /** Departments carried by the embed — same rows the separate read used to return. */
    departments: SlugResolutionDepartmentRow[];
}> {
    const { supabase, orgId, dim, platformKey } = params;
    const base = () =>
        applyDepartmentScope(
            supabase
                .from("work_units")
                .select(SLUG_WU_SELECT)
                .eq("org_id", orgId)
                .eq("is_active", true),
            dim
        );

    // Direct + lifecycle are two `key`-equality reads on the SAME table — merge them into ONE `.in(key)`
    // read and split by priority in-memory (direct exact-key wins, else lifecycle). Removes one serial
    // round-trip from the commit-critical route-identity resolve (measured: fetchWorkUnits was ~1150 ms /
    // 3 serial reads on a lifecycle slug that misses both targeted reads). org_scan stays a MISS-ONLY
    // fallback, so this is never more reads than before and preserves scalability (no always-org scan).
    const stageKeys = operatorStageKeysForPipelineQueueKey(platformKey);
    const lifecycleWuKeys = [
        ...new Set(stageKeys.map((stage) => lifecycleStageWorkUnitKey(stage).toLowerCase())),
    ];
    const candidateKeys = [...new Set([platformKey, ...lifecycleWuKeys])];
    const { data: candidateData, error: candidateErr } = await base().in("key", candidateKeys);
    if (candidateErr) throw candidateErr;
    const candidateRows = mapRows(candidateData);

    const directRows = candidateRows.filter((r) => r.key === platformKey);
    if (directRows.length) {
        return { rows: directRows, strategy: "direct", departments: embeddedDepartments(candidateData, orgId) };
    }
    if (lifecycleWuKeys.length) {
        const lifecycleRows = candidateRows.filter(
            (r) => typeof r.key === "string" && lifecycleWuKeys.includes(r.key.toLowerCase()),
        );
        if (lifecycleRows.length) {
            return { rows: lifecycleRows, strategy: "lifecycle", departments: embeddedDepartments(candidateData, orgId) };
        }
    }

    /** Queue-lane slugs require scanning queue_definition across candidates — fallback only. */
    const { data: allData, error: allErr } = await base();
    if (allErr) throw allErr;
    return { rows: dedupeRows(mapRows(allData)), strategy: "org_scan", departments: embeddedDepartments(allData, orgId) };
}

export type SlugResolutionDepartmentRow = {
    id: string;
    key: string | null;
    name: string | null;
    /** `departments.metadata` — carries `work_views_v1` for `work_view` slug resolution. */
    metadata: unknown;
};

/**
 * Department hints for slug resolution — identity + metadata (configured Work Views) for the
 * candidate work units' departments ONLY (kept lean: never an org-wide department scan).
 */
export async function fetchDepartmentsForSlugResolution(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentIds: readonly string[];
}): Promise<SlugResolutionDepartmentRow[]> {
    const ids = [...new Set(params.departmentIds.filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await params.supabase
        .from("departments")
        .select("id, key, name, metadata")
        .eq("org_id", params.orgId)
        .in("id", ids);
    if (error) throw error;
    return (data ?? []).map((d) => ({
        id: d.id as string,
        key: (d.key as string | null) ?? null,
        name: (d.name as string | null) ?? null,
        metadata: (d as { metadata?: unknown }).metadata ?? null,
    }));
}
