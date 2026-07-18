/**
 * Operational Graph — model, revision & adjacency (Phase A · §1 of
 * docs/platform/runtime/workspace-operational-preparation-runtime.md).
 *
 * The graph is the authoritative, finite enumeration of every reachable operational destination,
 * compiled from published configuration and authorization (§1) — never a second hard-coded
 * navigation registry (§Invariant 4). Each node carries only *identity + composition pointers*,
 * never data (§1.1); data is prepared per-destination downstream (Phase B, the Prepared
 * Destination store).
 *
 *     Workspace (root) → Work Unit → Work View → Queue Position → Subject → Focus Mode
 *
 * This module holds the compiled graph's node/edge model, its revision token, and the deterministic
 * adjacency accessors the preparation scheduler traverses (§1.2). The compiler that produces a
 * graph lives in `compileOperationalGraph.ts`; both are pure (no I/O, no time, no environment).
 */

import {
    type DestinationId,
    destinationNodeKey,
    nodeDestinationId,
} from "@/lib/runtime/graph/destinationId";

/**
 * Graph revision — a version vector over the three inputs that can change reachability or
 * composition (§1.4). Any change bumps at least one component; prepared destinations tagged with an
 * older revision are re-scoped or invalidated (§1.6).
 */
export type GraphRevision = {
    /** Bumped by a surface/config publication — composition pointers may resolve differently (§8). */
    surfaceConfigRevision: number;
    /** Bumped by a permission change — the reachable node set may grow or shrink (§1.4 security). */
    authorizationRevision: number;
    /** Bumped by a nav-structure change — Work Unit / Work View add/remove (§1.6). */
    navigationStructureRevision: number;
};

export const ZERO_GRAPH_REVISION: GraphRevision = {
    surfaceConfigRevision: 0,
    authorizationRevision: 0,
    navigationStructureRevision: 0,
};

export function graphRevisionEquals(a: GraphRevision, b: GraphRevision): boolean {
    return (
        a.surfaceConfigRevision === b.surfaceConfigRevision &&
        a.authorizationRevision === b.authorizationRevision &&
        a.navigationStructureRevision === b.navigationStructureRevision
    );
}

/**
 * Is `candidate` the same or a strictly-later revision than `base` (version-vector dominance)?
 * A prepared destination is scope-coherent to commit against a graph only when the graph's revision
 * is same-or-newer on every component — a mismatch on any axis means re-scope/invalidate (§1.6).
 */
export function graphRevisionIsSameOrNewer(candidate: GraphRevision, base: GraphRevision): boolean {
    return (
        candidate.surfaceConfigRevision >= base.surfaceConfigRevision &&
        candidate.authorizationRevision >= base.authorizationRevision &&
        candidate.navigationStructureRevision >= base.navigationStructureRevision
    );
}

// ── Nodes (identity + composition pointers only — never data, §1.1) ───────────────────────────

/** Root node: the operator's Workspace — the process-tile set + ordering (§1.1). */
export type WorkspaceNode = {
    readonly kind: "workspace";
    /** Work Unit ids in display (tile) order. */
    readonly workUnitIds: readonly string[];
};

/** A Work Unit: business process identity + its default Work View + Header composition ref (§1.1). */
export type WorkUnitNode = {
    readonly kind: "workUnit";
    readonly id: string;
    readonly label: string | null;
    readonly departmentId: string;
    /** Published Header surface variant ref (composition pointer, resolved via resolveSurfaceVariant). */
    readonly headerVariantRef: string | null;
    /** The Work View a bare Work Unit destination lands on (first visible when unset). */
    readonly defaultWorkViewId: string | null;
    /** Sibling Work Views under this process, in display (adjacency) order (§1.2). */
    readonly workViewIds: readonly string[];
    readonly displayOrder: number;
};

/** A Work View: lens + queue-row variant + sort/grain + default-subject strategy (§1.1). */
export type WorkViewNode = {
    readonly kind: "workView";
    readonly id: string;
    readonly workUnitId: string;
    readonly label: string;
    /** Lens id / lane binding (`compat_queue_key` when present, else the view id). */
    readonly lens: string | null;
    /** Published queue-row surface variant ref (composition pointer). */
    readonly queueRowVariantRef: string | null;
    readonly queueLayoutId: string | null;
    readonly focusPanelLayoutId: string | null;
    /** Strategy that picks the default subject when a destination arrives with `subjectId: null`. */
    readonly defaultSubjectStrategy: string | null;
    readonly displayOrder: number;
};

/**
 * The compiled Operational Graph. `workUnits` / `workViews` are keyed by id for O(1) lookup;
 * `destinations` is the enumerated set of node-level (workUnitId, workViewId) reachable
 * destinations (subject/mode unresolved — those are pinned at prepare time, §1.3).
 */
export type OperationalGraph = {
    readonly revision: GraphRevision;
    /** Content-addressed store/scope token: revision vector + a structure hash (§1.3). */
    readonly revisionToken: string;
    readonly workspace: WorkspaceNode;
    readonly workUnits: ReadonlyMap<string, WorkUnitNode>;
    readonly workViews: ReadonlyMap<string, WorkViewNode>;
    /** Every reachable node-level destination, in (work-unit order, then work-view order). */
    readonly destinations: readonly DestinationId[];
    /** Node keys (see `destinationNodeKey`) of every reachable destination — O(1) membership. */
    readonly destinationKeys: ReadonlySet<string>;
};

// ── Adjacency accessors (the edges the scheduler traverses, §1.2) ─────────────────────────────

/** Work Units in display order (Workspace → Work Unit edge). */
export function workUnitsInOrder(graph: OperationalGraph): WorkUnitNode[] {
    return graph.workspace.workUnitIds
        .map((id) => graph.workUnits.get(id))
        .filter((n): n is WorkUnitNode => Boolean(n));
}

/** Sibling Work Views under a Work Unit, in display order (Work Unit → Work View edge). */
export function workViewsOf(graph: OperationalGraph, workUnitId: string): WorkViewNode[] {
    const wu = graph.workUnits.get(workUnitId);
    if (!wu) return [];
    return wu.workViewIds
        .map((id) => graph.workViews.get(id))
        .filter((n): n is WorkViewNode => Boolean(n));
}

/**
 * The Work Views adjacent to a given view — its siblings under the same Work Unit, excluding
 * itself (the "sibling lenses" edge the scheduler warms, §1.2 / §6). Returns `[]` if the view
 * is unknown.
 */
export function siblingWorkViews(graph: OperationalGraph, workViewId: string): WorkViewNode[] {
    const view = graph.workViews.get(workViewId);
    if (!view) return [];
    return workViewsOf(graph, view.workUnitId).filter((v) => v.id !== workViewId);
}

/** The Work View a bare Work Unit destination lands on: its `defaultWorkViewId`, else first sibling. */
export function defaultWorkViewFor(graph: OperationalGraph, workUnitId: string): WorkViewNode | null {
    const wu = graph.workUnits.get(workUnitId);
    if (!wu) return null;
    if (wu.defaultWorkViewId) {
        const explicit = graph.workViews.get(wu.defaultWorkViewId);
        if (explicit && explicit.workUnitId === workUnitId) return explicit;
    }
    return workViewsOf(graph, workUnitId)[0] ?? null;
}

/** Is a (workUnitId, workViewId) destination reachable in this graph? (§1.4 authorization scoping). */
export function hasDestination(
    graph: OperationalGraph,
    id: Pick<DestinationId, "workUnitId" | "workViewId">,
): boolean {
    return graph.destinationKeys.has(destinationNodeKey(id));
}

/**
 * The sibling-view destinations adjacent to a destination (§6 Work-View continuity): the same
 * subject/mode carried onto each sibling Work View. Preparation uses these as P1 adjacency targets.
 */
export function adjacentWorkViewDestinations(
    graph: OperationalGraph,
    from: DestinationId,
): DestinationId[] {
    return siblingWorkViews(graph, from.workViewId).map((v) => ({
        workUnitId: v.workUnitId,
        workViewId: v.id,
        subjectId: from.subjectId,
        focusMode: from.focusMode,
    }));
}

/** Convenience: the node-level destination for a (workUnit, workView) pair, if reachable. */
export function destinationFor(
    graph: OperationalGraph,
    workUnitId: string,
    workViewId: string,
): DestinationId | null {
    return hasDestination(graph, { workUnitId, workViewId })
        ? nodeDestinationId(workUnitId, workViewId)
        : null;
}
