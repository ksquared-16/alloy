/**
 * Universal Surface Composition model (Experience Builder V3).
 *
 * The single vocabulary every Alloy builder converges onto. A Card is ONE
 * Component type — so are a Queue Row, a Header Tile, a Dashboard Metric, a
 * Portal Section. One engine composes them all; only the renderer/content-source
 * (injected elsewhere) varies.
 *
 *   Surface → Canvas → Component → Evidence Group → Composition Item
 *                                       ↑ Conditions + Actions are cross-cutting facets
 *
 * Keystone: a Component's Expanded / Workspace depth can **open another Surface**
 * (`openSurfaceId`). "Expanded is another Surface." This module owns the types;
 * `surfaceRegistry.ts` owns registration + recursion-safe resolution.
 *
 * @see docs/platform/operator/experience-builder-v3-universal-surface-composition.md
 */

// ── Component types (a Card is just one of these) ──────────────────────────────

export type SurfaceComponentType =
    | "card" // Focus Panel card
    | "queue_row" // condensed queue row component
    | "header_tile" // workspace / work-unit header metric
    | "metric" // dashboard metric tile
    | "section" // portal / document section
    | "config_panel"; // operational configuration panel (e.g. Financial Configuration)

// ── Composition Item kinds (the six atomic bound units) ────────────────────────

export type CompositionItemKind =
    | "field"
    | "widget"
    | "related_list"
    | "calculation"
    | "ai_summary"
    | "action";

/** Entity namespaces a Composition Item can read from (mirrors the adapter union). */
export type SurfaceEntityNamespace =
    | "opportunity"
    | "customer"
    | "person"
    | "child"
    | "inquiry_child"
    | "queue_row"
    | "concept"
    | "person_child_relationship";

/** A declarative condition gate (one grammar across every builder). */
export type SurfaceConditionKind =
    | "visible_when"
    | "read_only_when"
    | "highlighted_when"
    | "collapsed_when";

export type SurfaceCondition = {
    kind: SurfaceConditionKind;
    /** Record path evaluated at compose time (e.g. "placement_status"). */
    path: string;
    op?: "exists" | "equals" | "not_equals" | "count_gt";
    value?: string | number;
};

/** A declarative operator action (from a catalog, never a raw key). */
export type SurfaceActionKind = "link" | "inline_edit" | "open_surface" | "handoff";

export type SurfaceAction = {
    kind: SurfaceActionKind;
    label: string;
    /** For kind === "open_surface" / "handoff": the target Surface id. */
    openSurfaceId?: string;
};

// ── Composition Item ───────────────────────────────────────────────────────────

export type CompositionItem = {
    /** refKey or concept path identifying the bound value. */
    key: string;
    label: string;
    kind: CompositionItemKind;
    namespace?: SurfaceEntityNamespace;
    conditions?: SurfaceCondition[];
    actions?: SurfaceAction[];
};

// ── Evidence Group ─────────────────────────────────────────────────────────────

export type EvidenceGroupSpec = {
    key: string;
    /** Business name — never abstract ("Group 1" is forbidden). */
    label: string;
    purpose?: string;
    /** Which card owns (and may edit) this group's truth. */
    owner?: string;
    items: CompositionItem[];
    conditions?: SurfaceCondition[];
};

// ── Component (the unit on the canvas) ─────────────────────────────────────────

/**
 * Depth binding: how a component behaves at each lifecycle depth. The keystone
 * V3 primitive lives here — Expanded / Workspace may resolve to a nested Surface.
 */
export type ComponentDepthBinding = {
    /** Expanded depth opens this Surface instead of "more fields". */
    expanded?: { openSurfaceId: string };
    /** Workspace depth (larger work) opens this Surface. */
    workspace?: { openSurfaceId: string };
};

export type SurfaceComponentSpec = {
    /** Stable component instance id. */
    id: string;
    /** Operator-facing name. */
    label: string;
    componentType: SurfaceComponentType;
    evidenceGroups: EvidenceGroupSpec[];
    /** Expanded/Workspace → nested Surface (the recursion primitive). */
    depth?: ComponentDepthBinding;
    /** Layout intent on the canvas. */
    width?: "quarter" | "third" | "half" | "two_thirds" | "full" | "fill";
};

// ── Canvas + Surface ───────────────────────────────────────────────────────────

/** A canvas row holds one or more components (supports stacked sections). */
export type CanvasRow = {
    id: string;
    components: SurfaceComponentSpec[];
};

export type SurfaceCanvas = {
    rows: CanvasRow[];
};

/** Grain a surface is declared at (from operational-grain-doctrine). */
export type SurfaceGrain = "case" | "child" | "candidate" | "none";

export type SurfaceSpec = {
    /** Stable surface id (used as an `openSurfaceId` target). */
    id: string;
    /** Operator-facing surface name. */
    label: string;
    /** Which builder category this surface belongs to. */
    category: "focus_panel" | "queue_row" | "header" | "dashboard" | "operational_config" | "record";
    grain?: SurfaceGrain;
    canvas: SurfaceCanvas;
    /** Version for publish/versioning parity. */
    version?: number;
};

// ── Derivations ────────────────────────────────────────────────────────────────

/** Every component in a surface, flattened across canvas rows. */
export function surfaceComponents(surface: SurfaceSpec): SurfaceComponentSpec[] {
    return surface.canvas.rows.flatMap((r) => r.components);
}

/** All Surface ids a component can open (expanded + workspace). */
export function componentOpenSurfaceIds(component: SurfaceComponentSpec): string[] {
    const ids: string[] = [];
    if (component.depth?.expanded?.openSurfaceId) ids.push(component.depth.expanded.openSurfaceId);
    if (component.depth?.workspace?.openSurfaceId) ids.push(component.depth.workspace.openSurfaceId);
    // open_surface / handoff actions on items also nest.
    for (const group of component.evidenceGroups) {
        for (const item of group.items) {
            for (const action of item.actions ?? []) {
                if (action.openSurfaceId) ids.push(action.openSurfaceId);
            }
        }
    }
    return [...new Set(ids)];
}

/** Does this surface conform to the naming invariant (no abstract group labels)? */
export function hasAbstractGroupLabel(surface: SurfaceSpec): boolean {
    const ABSTRACT = /^(Evidence Group|Group|Block|Section|Details)\s*\d*$/i;
    return surfaceComponents(surface).some((c) =>
        c.evidenceGroups.some((g) => ABSTRACT.test(g.label.trim())),
    );
}
