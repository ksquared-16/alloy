/**
 * Platform Surface Builder — the canonical contract.
 *
 * There is exactly ONE builder in Alloy. It builds every configurable surface
 * (Focus Panels, Operational Intelligence, Executive Performance, Workspace/Work-unit
 * headers, Reports, …) and is unaware of business meaning. A surface is expressed as a
 * `SurfaceDefinition`; the builder branches only on definition *fields* (e.g. section
 * mode), never on `surfaceType` values. No `if (surfaceType === "analytics")`.
 *
 * Plan: docs/sprints/06_2026/analytics-surface-builder/01-surfacebuilder-extraction-plan.md
 */

import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
 * Live document the builder edits (generic — no surface knows it's special).
 * ------------------------------------------------------------------------- */

export type SurfaceCardInstance = {
    instanceId: string;
    /** References a CardDefinition.key in the surface's catalog. */
    cardTypeKey: string;
    /** References a ContentDefinition.id (metric/calculation/field), or null until chosen. */
    contentId: string | null;
    /** Inspector-driven config (title, thresholds, drill, …) — opaque to the engine. */
    config: Record<string, unknown>;
    /** Grid span (1..12) when the surface uses a grid; optional. */
    span?: number;
    /** Surfaces this card is promoted to (placement, named for operators). */
    promotedTo?: string[];
};

export type SurfaceSectionInstance = {
    sectionId: string;
    title: string;
    cards: SurfaceCardInstance[];
};

/** The editable structure of a surface. A single section when `sections === "none"`. */
export type SurfaceDoc = {
    sections: SurfaceSectionInstance[];
};

/* ---------------------------------------------------------------------------
 * Definition pieces — what a consumer provides.
 * ------------------------------------------------------------------------- */

/** How a surface uses sections. */
export type SectionMode =
    | "none" // single implicit section (e.g. Focus Panel)
    | "fixed" // a fixed set of sections (e.g. a header)
    | "authorable"; // operator adds/removes/reorders sections (e.g. Operational Intelligence)

/** A card type the surface offers (renderer-backed). */
export type CardDefinition = {
    key: string;
    label: string;
    icon: string;
    /** References a RendererDefinition.key. */
    rendererKey: string;
    /** Optional grouping for the component library ("Measure", "Understand", …). */
    group?: string;
    /** One-line plain-language description shown in the Add Card picker. */
    description?: string;
};

/** A renderer choice for a card (the runtime owns actual rendering; this is picker metadata). */
export type RendererDefinition = {
    key: string;
    label: string;
    icon?: string;
    /** Card type keys this renderer is valid for; empty = any. */
    appliesTo?: readonly string[];
};

/** A pickable content item (a metric/calculation for analytics; an entity field for Focus Panel). */
export type ContentDefinition = {
    id: string;
    label: string;
    question?: string;
    /** Business grouping (business process / category) for the picker. */
    group: string;
    /** Operator-facing readiness, never an implementation term. */
    availability?: "live" | "available" | "setup";
};

/** Lists pickable content for the surface. The builder never knows what content *means*. */
export type ContentSourceProvider = {
    list: () => readonly ContentDefinition[];
    resolveLabel: (contentId: string) => string;
};

/* ---- Inspector schema (declarative; the builder renders it generically) ---- */

export type InspectorFieldKind =
    | "content"
    | "renderer"
    | "text"
    | "textarea"
    | "select"
    | "thresholds"
    | "promote"
    | "toggle";

export type InspectorField = {
    key: string;
    label: string;
    kind: InspectorFieldKind;
    options?: readonly { value: string; label: string }[];
    help?: string;
};

export type InspectorTab = { key: string; label: string; fields: readonly InspectorField[] };

export type InspectorSchema = { tabs: readonly InspectorTab[] };

/* ---- Runtime renderer (the live canvas) ---- */

export type SurfaceRenderContext = {
    /** Resolved content label for the instance, for preview chrome. */
    contentLabel: string;
    /** Compact surfaces (headers) render a denser card. */
    density?: "compact" | "comfortable";
};

export type SurfaceRuntimeRenderer = {
    /** Render one card instance live for the canvas. */
    renderCard: (instance: SurfaceCardInstance, ctx: SurfaceRenderContext) => ReactNode;
};

/* ---- Persistence (the ONLY surface-specific I/O) ---- */

export type SurfacePersistenceAdapter = {
    /** Load the current doc for this surface scope. */
    load: () => Promise<SurfaceDoc>;
    /** Persist the full doc (the adapter maps to its store — placements, entity_layouts, …). */
    persist: (doc: SurfaceDoc) => Promise<void>;
    /** Optional explicit publish step (surfaces with a draft/published split). */
    publish?: () => Promise<void>;
};

/* ---------------------------------------------------------------------------
 * The definition — everything the builder needs, and nothing more.
 * ------------------------------------------------------------------------- */

export type SurfaceDefinition = {
    surfaceType: string; // opaque id; the builder never branches on its value
    title: string;
    sections: SectionMode;
    cardTypes: readonly CardDefinition[];
    renderers: readonly RendererDefinition[];
    contentSource: ContentSourceProvider;
    inspectorSchema: InspectorSchema;
    runtimeRenderer: SurfaceRuntimeRenderer;
    persistence: SurfacePersistenceAdapter;
    /** Whether this surface persists immediately (no publish step), e.g. metric_placements. */
    immediatePersist?: boolean;
    /** Operator-facing "where this appears" line for the builder toolbar. */
    appearsIn?: string;
    /** Link to the published live surface (the builder's "Open runtime"). */
    runtimeHref?: string;
    /** Compact surfaces (headers) render a denser canvas preview. */
    density?: "compact" | "comfortable";
    /** Default starter content — powers "Start from template" / "Reset to template". */
    template?: SurfaceDoc;
};
