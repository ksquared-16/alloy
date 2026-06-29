import "server-only";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { fetchWorkUnitsForSlugResolution } from "@/lib/admin/fetchWorkUnitsForSlugResolution";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";
import type { WorkUnitSlugRouteCacheEntry } from "@/lib/admin/workUnitSlugRouteCache";

/**
 * Server-side resolution of a `/workspace/work-unit/:slug` route slug → minimal work-unit route
 * identity (Operational Runtime Doctrine Laws 1/5). Resolving this BEFORE the client host mounts
 * removes the `WorkUnitWorkspaceColdShell` + client `useEffect` slug-resolution waterfall, so the
 * surface reveals once instead of cold-shell → resolve → compat page.
 *
 * Reuses the EXACT same helpers as `GET /api/admin/work-units/by-slug/:slug`
 * (`fetchWorkUnitsForSlugResolution` + `resolveWorkUnitByRouteSlug`), so the server seed and the
 * client fallback resolve identically. Returns `null` for invalid slug / no access / not-found /
 * ambiguous / error — the client host then falls back to its existing resolution + messaging.
 */
export async function loadWorkUnitSlugRouteMetaServer(
    workUnitSlug: string,
): Promise<WorkUnitSlugRouteCacheEntry | null> {
    try {
        const slug = typeof workUnitSlug === "string" ? workUnitSlug.trim() : "";
        const platformKey = workUnitRouteSlugToKey(slug);
        if (!platformKey) return null;

        const gate = await loadAdminRouteGate();
        if (!gate.ok) return null;
        if (
            gate.dim.departmentScope === "restricted" &&
            !(gate.dim.allowedDepartmentIds ?? []).length
        ) {
            return null;
        }

        const supabase = createAdminClient();
        const { rows: workUnits } = await fetchWorkUnitsForSlugResolution({
            supabase,
            orgId: gate.orgId,
            dim: gate.dim,
            platformKey,
        });

        const deptIds = [...new Set(workUnits.map((row) => row.department_id).filter(Boolean))];
        let departments: { id: string; key: string | null; name: string | null }[] = [];
        if (deptIds.length) {
            const { data } = await supabase
                .from("departments")
                .select("id, key, name")
                .eq("org_id", gate.orgId)
                .in("id", deptIds);
            departments = (data ?? []).map((d) => ({ id: d.id, key: d.key ?? null, name: d.name ?? null }));
        }

        const result = resolveWorkUnitByRouteSlug({ slug, workUnits, departments });
        // not_found / ambiguous → defer to the client fallback (it renders the precise message).
        if (result.status !== "resolved") return null;

        const { match } = result;
        return {
            routeSlug: match.routeSlug,
            departmentId: match.departmentId,
            workUnitId: match.workUnitId,
            workUnitKey: match.workUnitKey,
            workUnitName: match.workUnitName,
            initialQueueKey: match.initialQueueKey,
        };
    } catch {
        return null;
    }
}
