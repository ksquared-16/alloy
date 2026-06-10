import { isCanonicalDrawerHostPath } from "@/lib/admin/canonicalAdminRoutes";
import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { isVmBackedDrawerEntityType } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import {
    coerceAdminV2VmDrawerRoute,
    resolveVmDrawerRuntimeRoute,
    type VmDrawerRuntimeRoute,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";

/** Resolved VM route after cutover coercion (kill switches may still return `legacy`). */
export function resolveVmCutoverDrawerRoute(
    drawer: AdminDrawerState,
    pathname: string | null | undefined,
): VmDrawerRuntimeRoute {
    const route = resolveVmDrawerRuntimeRoute(drawer, pathname);
    return coerceAdminV2VmDrawerRoute(route, drawer, pathname);
}

/**
 * True when VM cutover owns Opportunity/Person/Child on a canonical drawer host.
 * Legacy monolith must not mount — kill switches keep this false so emergency rollback works.
 */
export function legacyDrawerMustNotRenderVmBackedEntity(
    drawer: AdminDrawerState,
    pathname: string | null | undefined,
): boolean {
    if (!drawer.type || !drawer.id || drawer.id === "new") return false;
    if (!isVmBackedDrawerEntityType(drawer.type)) return false;
    if (!isCanonicalDrawerHostPath(pathname)) return false;
    return resolveVmCutoverDrawerRoute(drawer, pathname) !== "legacy";
}
