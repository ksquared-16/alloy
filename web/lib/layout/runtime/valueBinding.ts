/**
 * Layout Contract V1 — value binding classification (Phase 1).
 *
 * Maps Sprint 1 LayoutItem kinds + metadata onto contract block semantics
 * (§2, §6, §8.1.3) without adding new item kinds or a parallel runtime.
 *
 * Production LayoutDoc still uses field | field_group | related_list | widget_placeholder.
 * Binding class is carried in item.metadata.binding (runtime-only convention).
 */

/** Contract-aligned block kind (layout_contract_v1.md §2). */
export type LayoutContractBlockKind =
    | "section"
    | "relationship_section"
    | "repeater"
    | "widget"
    | "queue";

/**
 * How a layout item resolves its displayed value at runtime.
 * Orthogonal to LayoutItemKind (presentation structure).
 */
export type LayoutValueBindingClass =
    | "base_field"
    | "relationship_field"
    | "reference_field"
    | "computed_projection"
    | "widget"
    | "repeater";

/**
 * Disambiguates location references — one generic "location" is forbidden.
 * See relationship_reference_runtime_notes.md.
 */
export type LocationReferenceRole =
    | "site"
    | "classroom"
    | "room"
    | "household_address"
    | "person_address";

/** Declarative relation descriptor (layout_contract_v1.md §6.1). */
export type LayoutRelationDescriptor = {
    relationKey: string;
    targetEntity: string;
    cardinality: "one" | "many";
    /** FK on anchor record (e.g. opportunities.primary_person_id). */
    fkColumn?: string;
    /** Named join / link table path when not a direct FK. */
    linkTable?: string;
    localKey?: string;
    targetKey?: string;
    /** Enrollment-child context: OCM row scoped to opportunity (not a product entity). */
    enrollmentChildContext?: boolean;
    locationRole?: LocationReferenceRole;
    label?: string;
};

/** Stored on LayoutItem.metadata.binding (optional; inferred when absent). */
export type LayoutItemBindingMetadata = {
    bindingClass?: LayoutValueBindingClass;
    contractBlockKind?: LayoutContractBlockKind;
    relationKey?: string;
    locationRole?: LocationReferenceRole;
    /** Lifecycle-owned compute key (§9.1 seam 1). */
    computeKey?: string;
    /** Catalog entity for field ref (namespaced refKey entity segment). */
    sourceEntity?: string;
    fieldKey?: string;
};

export const LAYOUT_BINDING_METADATA_KEY = "binding" as const;

export function readItemBindingMetadata(item: { metadata?: Record<string, unknown> }): LayoutItemBindingMetadata | null {
    const raw = item.metadata?.[LAYOUT_BINDING_METADATA_KEY];
    if (!raw || typeof raw !== "object") return null;
    return raw as LayoutItemBindingMetadata;
}
