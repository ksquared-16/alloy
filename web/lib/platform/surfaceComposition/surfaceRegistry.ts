/**
 * Surface registry + recursion-safe resolution (Experience Builder V3).
 *
 * One registry of `SurfaceSpec` definitions — the single source both the Surface
 * Library UI and the router read (retires the two hand-synced catalogs). Resolves
 * the keystone primitive: a component's `openSurfaceId` → the nested Surface,
 * with cycle detection so recursion (Children Surface → child → Children Surface)
 * terminates safely.
 *
 * @see universalSurfaceModel.ts
 * @see docs/platform/operator/experience-builder-v3-universal-surface-composition.md §3
 */

import {
    componentOpenSurfaceIds,
    surfaceComponents,
    type SurfaceComponentSpec,
    type SurfaceSpec,
} from "@/lib/platform/surfaceComposition/universalSurfaceModel";

// ── Registry ────────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, SurfaceSpec>();

/** Register (or replace) a surface definition. */
export function registerSurface(spec: SurfaceSpec): void {
    REGISTRY.set(spec.id, spec);
}

/** Register many at once. */
export function registerSurfaces(specs: readonly SurfaceSpec[]): void {
    for (const spec of specs) registerSurface(spec);
}

export function getSurface(id: string): SurfaceSpec | null {
    return REGISTRY.get(id) ?? null;
}

export function listSurfaces(): SurfaceSpec[] {
    return [...REGISTRY.values()];
}

/** Test/bootstrap helper: clear the registry. */
export function __resetSurfaceRegistry(): void {
    REGISTRY.clear();
}

// ── Recursion-safe resolution ──────────────────────────────────────────────────

export type ResolvedNestedSurface = {
    /** The component that opened the surface. */
    via: SurfaceComponentSpec;
    depth: "expanded" | "workspace";
    surface: SurfaceSpec;
};

/**
 * Resolve the Surface a component opens at a given depth. Returns null when the
 * component does not open a surface at that depth, or the target is unregistered.
 */
export function resolveOpenSurface(
    component: SurfaceComponentSpec,
    depth: "expanded" | "workspace",
): SurfaceSpec | null {
    const targetId = component.depth?.[depth]?.openSurfaceId;
    if (!targetId) return null;
    return getSurface(targetId);
}

export type SurfaceGraphNode = {
    surface: SurfaceSpec;
    /** Depth from the root (0 = root). */
    level: number;
};

/**
 * Walk the nested-surface graph from a root surface id, following every
 * `openSurfaceId` link (component depth bindings + open_surface/handoff actions).
 * Cycle-safe: a surface is visited once; `maxDepth` bounds runaway graphs.
 *
 * This is what proves "expanded is another surface" terminates — a Children
 * Surface that opens itself (child → child) resolves to the same registered node
 * rather than recursing forever.
 */
export function walkSurfaceGraph(
    rootId: string,
    opts: { maxDepth?: number } = {},
): SurfaceGraphNode[] {
    const maxDepth = opts.maxDepth ?? 8;
    const root = getSurface(rootId);
    if (!root) return [];

    const visited = new Set<string>();
    const out: SurfaceGraphNode[] = [];
    const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }];

    while (queue.length > 0) {
        const { id, level } = queue.shift()!;
        if (visited.has(id)) continue; // cycle / diamond guard
        if (level > maxDepth) continue;
        const surface = getSurface(id);
        if (!surface) continue;
        visited.add(id);
        out.push({ surface, level });

        for (const component of surfaceComponents(surface)) {
            for (const nestedId of componentOpenSurfaceIds(component)) {
                if (!visited.has(nestedId)) queue.push({ id: nestedId, level: level + 1 });
            }
        }
    }
    return out;
}

/** All surface ids reachable from a root (including the root). */
export function reachableSurfaceIds(rootId: string): string[] {
    return walkSurfaceGraph(rootId).map((n) => n.surface.id);
}

/**
 * Validate that every `openSurfaceId` referenced anywhere in the registry points
 * at a registered surface. Returns the list of dangling references (empty = OK).
 */
export function danglingOpenSurfaceRefs(): Array<{ surfaceId: string; componentId: string; missing: string }> {
    const problems: Array<{ surfaceId: string; componentId: string; missing: string }> = [];
    for (const surface of listSurfaces()) {
        for (const component of surfaceComponents(surface)) {
            for (const nestedId of componentOpenSurfaceIds(component)) {
                if (!REGISTRY.has(nestedId)) {
                    problems.push({ surfaceId: surface.id, componentId: component.id, missing: nestedId });
                }
            }
        }
    }
    return problems;
}
