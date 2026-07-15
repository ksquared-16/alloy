/**
 * Retained WORKSPACE surface (RETAINED-TRUTH §4). The operator must not watch /workspace reconstruct
 * itself after navigating away and back. This is the workspace analogue of the Work Unit surface
 * caches (`workUnitViewModelSessionCache.ts`): a module-scoped cache holding the LAST COMMITTED,
 * fully-settled workspace composition — process tiles (with counts folded in), header presentation,
 * right-rail actions — read synchronously in a `useRef` initializer at mount, rendered immediately,
 * then SWR-revalidated in the background.
 *
 * Isolation: the key carries org + user + access-scope + selected-site, so a read can never cross a
 * tenant, principal, permission scope, or site scope. Entries past the hard TTL are dropped on read.
 * A read newer than the freshness window returns `fresh:true` so the runtime can skip the immediate
 * background reload (no duplicate fan-out on a warm return); older returns `fresh:false` → render
 * retained + revalidate.
 */

import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { WorkspaceHeaderPresentationModel } from "./workspaceHeaderSurfaceConfig";
import type { WorkspaceProcessTileSnapshot } from "./workspaceProcessSurfaceAssembly";

/** Freshness window: a return within this age renders retained AND skips the background reload. */
export const WORKSPACE_SURFACE_FRESH_MS = 30_000;

export type WorkspaceSurfaceCacheContext = {
    orgId?: string | null;
    userId?: string | null;
    scopeFingerprint?: string | null;
    selectedSiteId?: string | null;
};

/** The retained, first-useful workspace surface — exactly what a warm return renders synchronously. */
export type RetainedWorkspaceSurface = {
    processSnapshot: WorkspaceProcessTileSnapshot;
    headerPresentation: WorkspaceHeaderPresentationModel;
    rightRailActions: ResolvedActionForClient[];
    defaultDepartmentId: string | null;
    committedAt: number;
};

type WorkspaceSurfaceCacheEntry = {
    surface: RetainedWorkspaceSurface;
    cachedAt: number;
};

const cache = new Map<string, WorkspaceSurfaceCacheEntry>();

function trim(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : "";
}

export function buildWorkspaceSurfaceCacheKey(context?: WorkspaceSurfaceCacheContext | null): string {
    const orgId = trim(context?.orgId) || "_";
    const userId = trim(context?.userId) || "_";
    const scopeFp = trim(context?.scopeFingerprint) || "_";
    const site = trim(context?.selectedSiteId) || "_";
    return `workspaceSurface:${orgId}:${userId}:${scopeFp}:${site}`;
}

/** A cache context is addressable only once the org identity is known (no org → cold path). */
export function workspaceSurfaceCacheContextReady(context?: WorkspaceSurfaceCacheContext | null): boolean {
    return trim(context?.orgId).length > 0;
}

export function putWorkspaceSurface(
    surface: Omit<RetainedWorkspaceSurface, "committedAt"> & { committedAt?: number },
    context?: WorkspaceSurfaceCacheContext | null,
): void {
    if (!workspaceSurfaceCacheContextReady(context)) return;
    const key = buildWorkspaceSurfaceCacheKey(context);
    const committedAt = surface.committedAt ?? Date.now();
    cache.set(key, { surface: { ...surface, committedAt }, cachedAt: committedAt });
}

export function peekWorkspaceSurface(
    context?: WorkspaceSurfaceCacheContext | null,
): { surface: RetainedWorkspaceSurface; fresh: boolean } | null {
    if (!workspaceSurfaceCacheContextReady(context)) return null;
    const key = buildWorkspaceSurfaceCacheKey(context);
    const entry = cache.get(key);
    if (!entry) return null;
    const age = Date.now() - entry.cachedAt;
    if (age > ADMINV2_UI_SESSION_CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return { surface: entry.surface, fresh: age <= WORKSPACE_SURFACE_FRESH_MS };
}

/** Org-change / logout flush. Key-scoping already prevents cross-tenant reads; this is defence in depth. */
export function clearWorkspaceSurfaceSessionCache(): void {
    cache.clear();
}
