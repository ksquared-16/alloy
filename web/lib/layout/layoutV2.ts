/**
 * Layout V2 — foundation type contracts (presentation only).
 *
 * Layout V2 moves presentation configuration out of hardcoded TypeScript
 * (`web/lib/entityPresentation.ts`, "Layer 0" fallback) into a configurable,
 * versioned, database-backed layer. This module defines ONLY the in-memory
 * shape of a layout document plus the closed vocabularies it may use.
 *
 * NON-GOALS (enforced by the type system and validator, see layoutV2Schema.ts):
 *  - No arbitrary nesting. The hierarchy is fixed at exactly:
 *        Layout → Section → Row → Column → Item
 *    (`field_group` may hold a single flat level of `field` items — a labeled
 *     cluster, not a generic container).
 *  - No custom CSS / className / style. Items carry a closed `renderHint` enum
 *    and an integer grid `width`/`span` only.
 *  - No color/theme fields anywhere.
 *  - No lifecycle/business logic. A layout references fields/widgets and places
 *    them; behavior (required, status, workflow, actions, permissions) is owned
 *    elsewhere. Lifecycle references layouts; layouts do not own lifecycle.
 *
 * This is a FOUNDATION sprint: nothing here is wired into the live runtime.
 * The preview renderer and config UI consume these types; production drawers
 * and queues remain on the existing renderers until a later adoption sprint.
 */

/** Document format version. Bump only on a breaking change to the doc shape. */
export const LAYOUT_DOC_FORMAT_VERSION = 1 as const;

/**
 * Surfaces supported in Sprint 1. Workspace / dashboard / record-workspace
 * surfaces are explicitly OUT of scope and intentionally absent here.
 */
export const LAYOUT_SURFACES = ["drawer", "queue"] as const;
export type LayoutSurface = (typeof LAYOUT_SURFACES)[number];

/**
 * Item kinds supported in Sprint 1. The widget contract is a *placeholder*:
 * Layout V2 only positions a widget by key; the widget owns its own data and
 * behavior. We do not try to solve every custom widget in this sprint.
 */
export const LAYOUT_ITEM_KINDS = [
    "field",
    "field_group",
    "related_list",
    "widget_placeholder",
] as const;
export type LayoutItemKind = (typeof LAYOUT_ITEM_KINDS)[number];

/**
 * Render hints — closed, presentation-only vocabulary, aligned 1:1 with the
 * existing renderer vocabulary in entityPresentation.ts so the migration
 * utility is lossless. A hint maps to a shared renderer; it carries no styling.
 */
export const LAYOUT_RENDER_HINTS = [
    "text",
    "status",
    "date",
    "datetime",
    "money",
    "link",
    "badge",
    "phone",
    "primary_yes_no",
    "custom",
] as const;
export type LayoutRenderHint = (typeof LAYOUT_RENDER_HINTS)[number];

export const LAYOUT_STATUSES = ["draft", "published"] as const;
export type LayoutStatus = (typeof LAYOUT_STATUSES)[number];

/** Min/max grid width for a column (12-column track). */
export const LAYOUT_GRID_COLUMNS = 12 as const;

/** When a link-type item is rendered as a button that opens another drawer. */
export interface LayoutLinkTarget {
    /** Field on the record holding the related entity id (e.g. primary_contact_id). */
    idField: string;
    /** Entity type to open (e.g. "contacts"). */
    entityType: string;
}

/**
 * Optional visibility rule for an item/row/section (V1 — presentation only).
 * Preserves intent; the renderer may apply or ignore it. NOT a rules engine.
 *  - "exists": show when `path` resolves to a non-empty value.
 *  - "equals": show when `path` equals `value`.
 * `path` is a namespaced source path, e.g. "person.secondary_contact".
 */
export const LAYOUT_CONDITION_TYPES = ["exists", "equals"] as const;
export type LayoutConditionType = (typeof LAYOUT_CONDITION_TYPES)[number];
export interface LayoutCondition {
    type: LayoutConditionType;
    path: string;
    value?: string;
}
export function isLayoutConditionType(v: unknown): v is LayoutConditionType {
    return typeof v === "string" && (LAYOUT_CONDITION_TYPES as readonly string[]).includes(v);
}

/**
 * Field action-icon adornment (V1.1). A small icon shown next to a field that
 * can act as a navigation affordance to a related record. Presentation only —
 * the proof renderer simulates navigation; live drawers are NOT wired.
 */
export const LAYOUT_ADORNMENT_ICONS = [
    "person",
    "child",
    "opportunity",
    "calendar",
    "task",
    "message",
    "document",
    "home",
    "phone",
    "mail",
    "location",
] as const;
export type LayoutAdornmentIcon = (typeof LAYOUT_ADORNMENT_ICONS)[number];

export const LAYOUT_ADORNMENT_ACTION_ENTITIES = ["person", "child", "opportunity"] as const;
export type LayoutAdornmentActionEntity = (typeof LAYOUT_ADORNMENT_ACTION_ENTITIES)[number];

export interface LayoutFieldAdornment {
    position: "left" | "right";
    icon: LayoutAdornmentIcon;
    /** Optional action; only the icon is the affordance, not the whole field. */
    action?: {
        type: "open_drawer";
        entity: LayoutAdornmentActionEntity;
        /** Namespaced path to the related id (e.g. "opportunity.primary_person_id"). */
        idPath?: string;
    };
}
export function isLayoutAdornmentIcon(v: unknown): v is LayoutAdornmentIcon {
    return typeof v === "string" && (LAYOUT_ADORNMENT_ICONS as readonly string[]).includes(v);
}
export function isLayoutAdornmentActionEntity(v: unknown): v is LayoutAdornmentActionEntity {
    return typeof v === "string" && (LAYOUT_ADORNMENT_ACTION_ENTITIES as readonly string[]).includes(v);
}

export const LAYOUT_COLUMN_WIDTHS = ["small", "medium", "large", "flexible"] as const;
export type LayoutColumnWidth = (typeof LAYOUT_COLUMN_WIDTHS)[number];

/**
 * Bounded queue-card zones (work-unit card). An item placed on a `queue` surface
 * card may carry `metadata.zone` to declare where it renders in the card; the
 * queue renderer also infers a zone heuristically when none is set. This is the
 * only queue-specific placement vocabulary — NOT a second layout system.
 */
export const LAYOUT_QUEUE_ZONES = [
    "header.title",
    "header.status",
    "header.attention",
    "header.location",
    "body.contact",
    "body.children",
    "body.tour",
    "actions.stack",
] as const;
export type LayoutQueueZone = (typeof LAYOUT_QUEUE_ZONES)[number];
export function isLayoutQueueZone(v: unknown): v is LayoutQueueZone {
    return typeof v === "string" && (LAYOUT_QUEUE_ZONES as readonly string[]).includes(v);
}

/**
 * Width behavior for rows/columns and related-list columns (presentation only;
 * no raw CSS exposed). Maps to a closed flex/grid behavior in the renderer.
 *  - equal: share remaining space evenly
 *  - content: size to content (shrink)
 *  - small/medium/large: fixed-ish proportional buckets
 *  - flexible: grow to fill remaining space
 */
export const LAYOUT_WIDTH_BEHAVIORS = ["equal", "content", "small", "medium", "large", "flexible"] as const;
export type LayoutWidthBehavior = (typeof LAYOUT_WIDTH_BEHAVIORS)[number];
export function isLayoutWidthBehavior(v: unknown): v is LayoutWidthBehavior {
    return typeof v === "string" && (LAYOUT_WIDTH_BEHAVIORS as readonly string[]).includes(v);
}

/** A column definition for a related_list rendered as a collection table. */
export interface LayoutCollectionColumn {
    label: string;
    /** Namespaced ref resolved against each row (e.g. "child.name"). */
    refKey: string;
    width?: LayoutColumnWidth;
    /** Width behavior (preferred over `width`; presentation-only buckets). */
    widthBehavior?: LayoutWidthBehavior;
    renderHint?: LayoutRenderHint;
    editable?: boolean;
    adornment?: LayoutFieldAdornment;
    /** Optional condition controlling whether the column renders for a row. */
    visibleWhen?: LayoutCondition;
    /** Static text + `{token}` replacement resolved against each row. */
    template?: string;
}
export function isLayoutColumnWidth(v: unknown): v is LayoutColumnWidth {
    return typeof v === "string" && (LAYOUT_COLUMN_WIDTHS as readonly string[]).includes(v);
}

/**
 * A single placed item inside a Column.
 *
 * `kind` selects how `refKey` is interpreted:
 *  - "field"             → refKey = field_key, optionally namespaced by source
 *                          entity (e.g. "person.primary_phone", "child.name").
 *  - "field_group"       → refKey = group key; `items` holds a flat list of "field" items
 *  - "related_list"      → refKey = related-module key (entityType + filterKey in metadata)
 *  - "widget_placeholder"→ refKey = widget key from the widget allow-list
 */
export interface LayoutItem {
    /** Stable id within the document (used by the editor and React keys). */
    id: string;
    kind: LayoutItemKind;
    /** Field key / group key / related-module key / widget key. */
    refKey: string;
    label?: string;
    renderHint?: LayoutRenderHint;
    /** Presentation flag only; never enforces business required-ness. */
    editable?: boolean;
    /** If true, the item cannot be removed/reordered by layout config. */
    locked?: boolean;
    /** For renderHint "link" items. */
    linkTarget?: LayoutLinkTarget;
    /**
     * For kind "field_group" ONLY: a single flat level of "field" items.
     * Validation rejects any non-"field" child and any deeper nesting.
     */
    items?: LayoutItem[];
    /**
     * For kind "field_group" as a CONTROLLED SUBGRID (column-in-column): one
     * level of rows → columns → field items. No field_group is allowed inside
     * (validator enforces), so nesting depth stays bounded.
     */
    rows?: LayoutRow[];
    /** For kind "related_list": the related entity + optional filter key. */
    related?: { entityType: string; filterKey?: string };
    /**
     * For kind "related_list" rendered as a collection table (e.g. Lead Children):
     * the source collection key on the record + ordered column definitions.
     */
    source?: string;
    displayMode?: string;
    columns?: LayoutCollectionColumn[];
    /** For kind "widget_placeholder": which registered widget to position. */
    widget?: { widgetKey: string; note?: string; displayMode?: string };
    /** Optional V1 visibility rule (preserved; renderer may apply or ignore). */
    visibleWhen?: LayoutCondition;
    /** Source entity group for a namespaced field (e.g. "person"); display aid. */
    sourceEntity?: string;
    /** Optional field action icon (V1.1); fields only. */
    adornment?: LayoutFieldAdornment;
    /**
     * Display-text template (computed item): static text with `{token}` slots
     * resolved against the record (e.g. "{last_name} Household"). When present,
     * the item renders the interpolated string instead of a single ref value.
     * Tokens are bare field keys or namespaced refs (e.g. "{person.last_name}").
     */
    template?: string;
    /** Width behavior for this column/item slot (presentation-only buckets). */
    widthBehavior?: LayoutWidthBehavior;
    /**
     * Presentation-only metadata bag (e.g. queue column `sortable`, group hints).
     * Never carries styling, color, or business rules.
     */
    metadata?: Record<string, unknown>;
}

/** A column inside a Row. Holds items; cannot hold rows/columns (no nesting). */
export interface LayoutColumn {
    id: string;
    /** Grid span 1..12. Sum across a row's columns should be ≤ 12 (validator warns). */
    width: number;
    items: LayoutItem[];
}

/** A row inside a Section. Holds columns only. */
export interface LayoutRow {
    id: string;
    columns: LayoutColumn[];
    /** Optional V1 visibility rule. */
    visibleWhen?: LayoutCondition;
}

/** A section inside a Layout. Holds rows only. */
export interface LayoutSection {
    id: string;
    key: string;
    title: string;
    collapsible?: boolean;
    defaultExpanded?: boolean;
    rows: LayoutRow[];
    /** Optional V1 visibility rule. */
    visibleWhen?: LayoutCondition;
}

/** The full presentation document for one (entity_type, surface). */
export interface LayoutDoc {
    formatVersion: typeof LAYOUT_DOC_FORMAT_VERSION;
    surface: LayoutSurface;
    entityType: string;
    sections: LayoutSection[];
    /** Presentation-only metadata (e.g. default sort for a queue surface). */
    metadata?: Record<string, unknown>;
}

/**
 * A persisted layout row (mirror of the `entity_layouts` table). `orgId === null`
 * denotes a system/industry default. `doc` is a validated {@link LayoutDoc}.
 */
export interface EntityLayoutRecord {
    id: string;
    orgId: string | null;
    industryKey: string | null;
    entityType: string;
    surface: LayoutSurface;
    layoutKey: string;
    name: string;
    version: number;
    status: LayoutStatus;
    isSystemDefault: boolean;
    doc: LayoutDoc;
    metadata: Record<string, unknown> | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string | null;
    publishedAt: string | null;
}

/** Where a resolved layout came from (for diagnostics + the preview UI banner). */
export type LayoutResolutionSource = "org" | "default" | "registry";

export interface LayoutResolution {
    doc: LayoutDoc;
    source: LayoutResolutionSource;
    /** The record used, when source is "org" or "default". */
    record?: EntityLayoutRecord;
}

/** Type guards used by the validator and renderer. */
export function isLayoutSurface(v: unknown): v is LayoutSurface {
    return typeof v === "string" && (LAYOUT_SURFACES as readonly string[]).includes(v);
}
export function isLayoutItemKind(v: unknown): v is LayoutItemKind {
    return typeof v === "string" && (LAYOUT_ITEM_KINDS as readonly string[]).includes(v);
}
export function isLayoutRenderHint(v: unknown): v is LayoutRenderHint {
    return typeof v === "string" && (LAYOUT_RENDER_HINTS as readonly string[]).includes(v);
}
