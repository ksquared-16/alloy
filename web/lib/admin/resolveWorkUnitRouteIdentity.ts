import "server-only";

/**
 * REQUEST-SCOPED shared resolution of a work-unit route slug → identity (Runtime V1 Realization, Phase 3
 * candidate A — dedup).
 *
 * The work-unit layout resolves the same slug TWICE in one request — once in
 * `loadWorkUnitSlugRouteMetaServer` (route-meta seed) and once in `composeProvisioningAnswerForRoute`
 * (provisioning seed) — each running the same `fetchWorkUnitsForSlugResolution` +
 * `fetchDepartmentsForSlugResolution` + `resolveWorkUnitByRouteSlug` DB reads. Wrapping the resolution in
 * React `cache()` (keyed on the slug string) makes the two calls — even the concurrent `Promise.all`
 * pair — share ONE resolution: the second is served from the in-flight/cached promise. Behavior is
 * identical (same inputs, same resolver); only the duplicate DB reads are removed.
 *
 * The gate itself is already request-memoized (`loadAdminAccessBundleCached` under `loadAdminRouteGate`),
 * so it is safe to call inside here too.
 */
import { cache } from "react";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadAdminRouteGate, type AdminRouteGateResult } from "@/lib/admin/adminRouteGate";
import {
    fetchWorkUnitsForSlugResolution,
    fetchDepartmentsForSlugResolution,
    type SlugResolutionDepartmentRow,
} from "@/lib/admin/fetchWorkUnitsForSlugResolution";
import {
    resolveWorkUnitByRouteSlug,
    type ResolveWorkUnitRouteSlugResult,
} from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

export type WorkUnitRouteIdentity = {
    gate: AdminRouteGateResult;
    /** The underscored platform key derived from the hyphenated route slug, or null if the slug is empty. */
    platformKey: string | null;
    /** The slug→work-unit resolution, or null when the gate failed or there is no platform key. */
    resolution: ResolveWorkUnitRouteSlugResult | null;
    /** Departments in scope (carries the configured Work Views + names the route-meta seed needs). */
    departments: SlugResolutionDepartmentRow[];
};

/**
 * Resolve the route identity for a slug. Never throws — resolution I/O failure degrades to
 * `resolution: null` so callers apply their own honest fallback, exactly as before. Resolution is
 * request-memoized via React `cache()` (a transparent dedup, see the module header) — an implementation
 * detail the name deliberately does not leak: callers ask for the identity, not for "the cached identity".
 */
export const resolveWorkUnitRouteIdentity = cache(
    async (slug: string): Promise<WorkUnitRouteIdentity> => {
        const gate = await loadAdminRouteGate();
        const platformKey = workUnitRouteSlugToKey((slug ?? "").trim());
        if (!gate.ok || !platformKey) {
            return { gate, platformKey, resolution: null, departments: [] };
        }
        try {
            const supabase = createAdminClient();
            /**
             * ONE read. The departments come embedded on the work-unit rows, so route identity no
             * longer pays a second serial round trip that could not start until the first named its
             * department ids — inside `route_meta`, which is spent before the first byte.
             *
             * The separate read remains for callers that hold department ids without work-unit rows;
             * this path falls back to it only if the embed produced nothing while rows exist, so a
             * relationship that cannot be embedded degrades to exactly the previous behaviour.
             */
            const { rows: workUnits, departments: embedded } = await fetchWorkUnitsForSlugResolution({
                supabase,
                orgId: gate.orgId,
                dim: gate.dim,
                platformKey,
            });
            const departments =
                embedded.length || !workUnits.length
                    ? embedded
                    : await fetchDepartmentsForSlugResolution({
                          supabase,
                          orgId: gate.orgId,
                          departmentIds: workUnits.map((r) => r.department_id),
                      });
            const resolution = resolveWorkUnitByRouteSlug({ slug, workUnits, departments });
            return { gate, platformKey, resolution, departments };
        } catch {
            // Resolution I/O failure must never throw here — callers fall back to their honest path.
            return { gate, platformKey, resolution: null, departments: [] };
        }
    },
);
