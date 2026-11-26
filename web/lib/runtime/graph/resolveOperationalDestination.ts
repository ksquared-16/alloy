/**
 * THE ONE URL → CANONICAL OPERATIONAL DESTINATION RESOLVER.
 *
 * The URL is NOT the runtime identity — it is one external representation that RESOLVES into a
 * canonical {@link DestinationId}. Every runtime owner (preparation, provisioning, K1, K2, the
 * Prepared Destination store, Workspace/Queue runtimes, history) must consume the resolved
 * `DestinationId`, never a raw slug or href string.
 *
 *     URL → route resolution → operational-destination resolution → canonical DestinationId
 *
 * The GUARANTEE this module exists to make: **two URLs that resolve to the same operational
 * destination produce a byte-identical DestinationId.** The polymorphic operator slug
 * (`/workspace/work-unit/:slug`) can name a work unit's default view three ways — the work-unit
 * key (`enrollment`), a work-view slug (`new-leads`), or the bare unit with an explicit
 * `?work_view_id=` — and all three must collapse to ONE identity. They do here because:
 *
 *   1. Route resolution is the SAME precedence the server uses (`resolveWorkUnitByRouteSlug`:
 *      work_unit_key → work_view → queue_lane), so the client can never disagree with the server.
 *   2. The work view is ALWAYS resolved to a concrete id — an implicit default (`initialWorkViewId`
 *      absent) is resolved to `firstVisibleWorkView(...)`, exactly as the D1 answer's
 *      `activeView = findWorkViewById(...) ?? firstVisibleWorkView(...)` does. So a bare entry and an
 *      explicit-default entry never fork: both carry the resolved default view id.
 *
 * Pure module: no I/O, no time, no environment. The catalog (authorized work units + their
 * departments' metadata) is passed in by the caller — the same rows the server route resolution and
 * the Workspace landing builder already hold — so this is safe to run on server or client.
 */
import {
    type DestinationId,
    nodeDestinationId,
    withFocusMode,
    withSubject,
} from "@/lib/runtime/graph/destinationId";
import {
    resolveWorkUnitByRouteSlug,
    type WorkUnitRouteSlugRow,
} from "@/lib/admin/resolveWorkUnitByRouteSlug";
import {
    savedWorkViewsFromDepartmentMetadata,
    firstVisibleWorkView,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

/** A department the resolver may consult for its configured Work Views (default-view resolution). */
export type DestinationCatalogDepartment = {
    id: string;
    key?: string | null;
    name?: string | null;
    /** `departments.metadata` — carries `work_views_v1` (required to resolve the default view). */
    metadata?: unknown;
};

/** The authorized catalog a client/server holds: work units + their departments' metadata. */
export type OperationalDestinationCatalog = {
    workUnits: readonly WorkUnitRouteSlugRow[];
    departments: readonly DestinationCatalogDepartment[];
};

/**
 * Resolve the concrete default Work View id for a work unit's department — the SAME choice the D1
 * provisioning answer makes for an implicit-default entry (`firstVisibleWorkView`). Returns null when
 * the department configures no visible Work View (no canonical operational destination exists yet).
 */
export function defaultWorkViewIdForDepartment(
    departmentMetadata: unknown,
): string | null {
    const views = savedWorkViewsFromDepartmentMetadata(departmentMetadata);
    return firstVisibleWorkView(views)?.id ?? null;
}

/**
 * Canonicalize an already-route-resolved destination into a {@link DestinationId}.
 *
 * `workViewId` is resolved to a CONCRETE id: an explicit view id is kept; an implicit default
 * (`null`) is resolved via the department's `firstVisibleWorkView`. This is the collapse point that
 * makes bare and explicit-default entries identical. Returns null when no concrete view can be
 * resolved (a view-less unit is not an operational destination).
 */
export function destinationIdFromResolvedRoute(args: {
    workUnitId: string;
    /** The route-resolved view id, or null for an implicit default (resolve via department). */
    initialWorkViewId: string | null;
    /** The matched unit's department metadata — used only to resolve an implicit default view. */
    departmentMetadata: unknown;
    subjectId?: string | null;
    focusMode?: string | null;
}): DestinationId | null {
    const workUnitId = args.workUnitId.trim();
    if (!workUnitId) return null;
    const workViewId =
        args.initialWorkViewId?.trim() || defaultWorkViewIdForDepartment(args.departmentMetadata);
    if (!workViewId) return null;
    let id = nodeDestinationId(workUnitId, workViewId);
    if (args.subjectId !== undefined) id = withSubject(id, args.subjectId ?? null);
    if (args.focusMode !== undefined) id = withFocusMode(id, args.focusMode ?? null);
    return id;
}

/**
 * THE full URL → DestinationId boundary. Resolves an operator route slug against the catalog with the
 * server's precedence, then canonicalizes the resolved view. Any two slugs that denote the same
 * operational destination return an identical DestinationId; an unresolvable slug returns null (the
 * caller commits nothing — the D1 answer would emit the same honest "no work unit" / "no view" error).
 */
export function resolveOperationalDestinationFromSlug(args: {
    slug: string;
    catalog: OperationalDestinationCatalog;
    /**
     * An explicit `?work_view_id=` lens carried on the URL. It is K1 intent and OVERRIDES the view the
     * slug implies — exactly as the D1 route does (`requestedWorkViewId ?? initialWorkViewId`). When
     * it names the unit's default view, the result is identical to a bare entry: no fork.
     */
    explicitWorkViewId?: string | null;
    subjectId?: string | null;
    focusMode?: string | null;
}): DestinationId | null {
    const resolved = resolveWorkUnitByRouteSlug({
        slug: args.slug,
        workUnits: [...args.catalog.workUnits],
        departments: args.catalog.departments.map((d) => ({
            id: d.id,
            key: d.key ?? null,
            name: d.name ?? null,
            metadata: d.metadata,
        })),
    });
    if (resolved.status !== "resolved") return null;
    const dept = args.catalog.departments.find((d) => d.id === resolved.match.departmentId);
    return destinationIdFromResolvedRoute({
        workUnitId: resolved.match.workUnitId,
        initialWorkViewId: args.explicitWorkViewId?.trim() || resolved.match.initialWorkViewId,
        departmentMetadata: dept?.metadata,
        subjectId: args.subjectId,
        focusMode: args.focusMode,
    });
}
