/**
 * Operational Graph — the compiler (Phase A · §1.5 of
 * docs/platform/runtime/workspace-operational-preparation-runtime.md).
 *
 * `graph = f(config, authorization)`. The graph is **server-authored, client-materialized** (§1.5):
 * configuration + authorization live server-side and decide *what is reachable*; the client
 * traverses the compiled graph to schedule preparation. This module is that pure compiling
 * function — it takes an already-authorized, already-resolved set of Work Units + Work Views (the
 * caller enumerates them post-authorization, §1.4) and emits the finite destination graph.
 *
 * Purity is the invariant that keeps this from becoming "a second hard-coded navigation registry"
 * (§Invariant 4): given the same authorized config, it always yields the same graph and the same
 * content-addressed revision token — no ambient reachability, no I/O, no time.
 */

import {
    type DestinationId,
    destinationNodeKey,
    nodeDestinationId,
} from "@/lib/runtime/graph/destinationId";
import {
    type GraphRevision,
    type OperationalGraph,
    type WorkUnitNode,
    type WorkViewNode,
    type WorkspaceNode,
    ZERO_GRAPH_REVISION,
} from "@/lib/runtime/graph/operationalGraph";

/** A Work Unit the operator is authorized to reach (caller enumerates post-authorization, §1.4). */
export type CompileWorkUnitInput = {
    id: string;
    label?: string | null;
    departmentId: string;
    headerVariantRef?: string | null;
    defaultWorkViewId?: string | null;
    /** Tile display order; ties break by input order. */
    displayOrder?: number;
};

/** A Work View under a Work Unit (already resolved from published config, orphans dropped upstream). */
export type CompileWorkViewInput = {
    id: string;
    label: string;
    lens?: string | null;
    queueRowVariantRef?: string | null;
    queueLayoutId?: string | null;
    focusPanelLayoutId?: string | null;
    defaultSubjectStrategy?: string | null;
    /** Pill display order; ties break by input order. */
    displayOrder?: number;
};

export type CompileOperationalGraphInput = {
    /** Authorized Work Units, in (or overriding to) display order. */
    workUnits: readonly CompileWorkUnitInput[];
    /** Work Views keyed by Work Unit id. A Work Unit absent here compiles with zero views. */
    workViewsByWorkUnit: Readonly<Record<string, readonly CompileWorkViewInput[]>>;
    /** Explicit revision vector from the server (§1.4). Missing components default to 0. */
    revision?: Partial<GraphRevision>;
};

/**
 * FNV-1a 32-bit — a small, stable, dependency-free string hash. Used only to content-address the
 * compiled structure into the revision token so that two graphs with identical explicit revision
 * numbers but different structure never share a store/scope key (defensive; §1.3).
 */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        // hash *= 16777619, kept in 32-bit unsigned space
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** Stable ordering: explicit displayOrder ascending, then original input index. */
function byDisplayOrder<T extends { displayOrder?: number }>(items: readonly T[]): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const oa = a.item.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const ob = b.item.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return oa - ob || a.index - b.index;
        })
        .map((wrapped) => wrapped.item);
}

/**
 * Compile the authorized config into an Operational Graph.
 *
 * Guarantees:
 *  - **Finite & complete**: `destinations` enumerates exactly one node-level destination per
 *    reachable (Work Unit, Work View) pair — no more (nothing invented), no fewer (nothing dropped).
 *  - **Authorization-scoped**: only the Work Units/Views the caller passes appear; a Work Unit the
 *    operator cannot reach is simply absent from input and therefore from the graph (§1.4).
 *  - **Deterministic & content-addressed**: identical input → identical graph and `revisionToken`.
 *  - **Duplicate-safe**: a repeated Work Unit / Work View id keeps its first occurrence.
 */
export function compileOperationalGraph(input: CompileOperationalGraphInput): OperationalGraph {
    const revision: GraphRevision = {
        surfaceConfigRevision:
            input.revision?.surfaceConfigRevision ?? ZERO_GRAPH_REVISION.surfaceConfigRevision,
        authorizationRevision:
            input.revision?.authorizationRevision ?? ZERO_GRAPH_REVISION.authorizationRevision,
        navigationStructureRevision:
            input.revision?.navigationStructureRevision ??
            ZERO_GRAPH_REVISION.navigationStructureRevision,
    };

    const workUnits = new Map<string, WorkUnitNode>();
    const workViews = new Map<string, WorkViewNode>();
    const workUnitOrder: string[] = [];
    const destinations: DestinationId[] = [];
    const destinationKeys = new Set<string>();
    // Segments hashed into the structure token — order-sensitive, so structure changes are visible.
    const structureParts: string[] = [];

    for (const wu of byDisplayOrder(input.workUnits)) {
        const workUnitId = wu.id.trim();
        if (!workUnitId || workUnits.has(workUnitId)) continue; // drop blank / duplicate ids

        const rawViews = input.workViewsByWorkUnit[workUnitId] ?? [];
        const viewIds: string[] = [];

        for (const view of byDisplayOrder(rawViews)) {
            const workViewId = view.id.trim();
            if (!workViewId || workViews.has(workViewId)) continue; // drop blank / duplicate ids
            const node: WorkViewNode = {
                kind: "workView",
                id: workViewId,
                workUnitId,
                label: view.label,
                lens: view.lens ?? null,
                queueRowVariantRef: view.queueRowVariantRef ?? null,
                queueLayoutId: view.queueLayoutId ?? null,
                focusPanelLayoutId: view.focusPanelLayoutId ?? null,
                defaultSubjectStrategy: view.defaultSubjectStrategy ?? null,
                displayOrder: view.displayOrder ?? viewIds.length + 1,
            };
            workViews.set(workViewId, node);
            viewIds.push(workViewId);

            const destination = nodeDestinationId(workUnitId, workViewId);
            destinations.push(destination);
            destinationKeys.add(destinationNodeKey(destination));
            structureParts.push(`${workUnitId}>${workViewId}:${node.lens ?? ""}`);
        }

        const defaultWorkViewId =
            wu.defaultWorkViewId && viewIds.includes(wu.defaultWorkViewId.trim())
                ? wu.defaultWorkViewId.trim()
                : (viewIds[0] ?? null);

        workUnits.set(workUnitId, {
            kind: "workUnit",
            id: workUnitId,
            label: wu.label ?? null,
            departmentId: wu.departmentId,
            headerVariantRef: wu.headerVariantRef ?? null,
            defaultWorkViewId,
            workViewIds: viewIds,
            displayOrder: wu.displayOrder ?? workUnitOrder.length + 1,
        });
        workUnitOrder.push(workUnitId);
    }

    const workspace: WorkspaceNode = { kind: "workspace", workUnitIds: workUnitOrder };
    const structureHash = fnv1a(structureParts.join("|"));
    const revisionToken =
        `${revision.surfaceConfigRevision}.${revision.authorizationRevision}` +
        `.${revision.navigationStructureRevision}:${structureHash}`;

    return {
        revision,
        revisionToken,
        workspace,
        workUnits,
        workViews,
        destinations,
        destinationKeys,
    };
}
