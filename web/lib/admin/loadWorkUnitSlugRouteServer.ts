import "server-only";

import { resolveWorkUnitRouteIdentityCached } from "@/lib/admin/resolveWorkUnitRouteIdentityCached";
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
        // Request-memoized (Phase 3 dedup): shares ONE slug→identity resolution with the layout's
        // provisioning seed (`composeProvisioningAnswerForRoute`) instead of repeating the DB reads.
        const { gate, resolution, departments } = await resolveWorkUnitRouteIdentityCached(slug);
        if (!gate.ok) return null;
        if (
            gate.dim.departmentScope === "restricted" &&
            !(gate.dim.allowedDepartmentIds ?? []).length
        ) {
            return null;
        }
        // not_found / ambiguous / unresolved → defer to the client fallback (it renders the precise message).
        if (!resolution || resolution.status !== "resolved") return null;

        const { match } = resolution;
        return {
            routeSlug: match.routeSlug,
            departmentId: match.departmentId,
            departmentName:
                departments.find((d) => d.id === match.departmentId)?.name ?? null,
            workUnitId: match.workUnitId,
            workUnitKey: match.workUnitKey,
            workUnitName: match.workUnitName,
            initialQueueKey: match.initialQueueKey,
            initialWorkViewId: match.initialWorkViewId,
        };
    } catch {
        return null;
    }
}
