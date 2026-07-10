/**
 * Canonical data-provider model — shared contract for configurable consumers.
 *
 * Canonical **data** is broader than canonical **fields**. Providers may represent
 * atomic fields, relationships, collections, calculated values, or runtime signals.
 *
 * @see docs/platform/modules/field-concepts.md
 * @see docs/sprints/08_2026/field-platform-consumer-audit.md
 */

import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";

/** Semantic provider kind — not interchangeable. */
export type CanonicalDataProviderKind =
    | "business_field"
    | "platform_field"
    | "calculated_field"
    | "runtime_signal"
    | "relationship"
    | "collection";

/** Value shape returned at resolution time. */
export type CanonicalDataShape = "scalar" | "object" | "collection";

/** Scalar value type for rendering — independent of provider kind. */
export type CanonicalDataValueType =
    | "text"
    | "number"
    | "date"
    | "boolean"
    | "choice"
    | "status"
    | "link"
    | "unknown";

/** Where a provider definition was derived from — not consumer-local. */
export type CanonicalDataProviderSource =
    | "field_definitions"
    | "platform_field_catalog"
    | "platform_field_manifest"
    | "childcare_layout_catalog"
    | "computed_field_catalog"
    | "contact_role_catalog"
    | "children_collection_registry"
    | "sibling_collection_registry"
    | "waitlist_placement_registry"
    | "queue_layout_defaults"
    | "queue_presentation_registry"
    | "legacy_compatibility";

export type CanonicalDataProviderSourceDerivation = {
    source: CanonicalDataProviderSource;
    /** Module path that owns the canonical definition. */
    sourceModule: string;
};

/** Why a provider is excluded from picker or publish for a consumer/context. */
export type QueueRowProviderExclusionReason =
    | "unknown_provider"
    | "wrong_context"
    | "unsupported_kind"
    | "unsupported_shape"
    | "missing_resolver"
    | "legacy_only"
    | "whole_collection_without_renderer"
    | "consumer_capability_blocked";

export type QueueRowProviderEligibility = {
    refKey: string;
    picker: boolean;
    publish: boolean;
    resolvable: boolean;
    reasons: QueueRowProviderExclusionReason[];
};

/** Stable consumer surfaces that declare provider capabilities. */
export type CanonicalDataConsumerSurface = FieldConsumerSurface;

/** How a relationship-derived scalar leaf binds to its parent relationship. */
export type RelationshipLeafBinding = {
    relationship_id: string;
    leaf_key: "name" | "email" | "phone" | "display_name" | string;
};

/** How a collection projection binds to its parent collection provider. */
export type CollectionProjectionBinding = {
    collection_ref: string;
    projection: "count" | "names" | "summary" | "list" | string;
};

export type CanonicalDataProviderAvailability = {
    /** Resolver can produce a value at runtime for pipeline queue rows. */
    pipeline: boolean;
    /** Resolver can produce a value at runtime for waitlist queue rows. */
    waitlist: boolean;
};

export type CanonicalDataProvider = {
    /** Stable canonical identity — persisted in consumer configuration. */
    refKey: string;
    label: string;
    kind: CanonicalDataProviderKind;
    outputShape: CanonicalDataShape;
    /** Storage / namespace entity grain (person, customer, child alias, queue_row, …). */
    entityNamespace: string;
    /** Settings hub entity when applicable. */
    settingsEntity?: string;
    /** Entity-owned category key (section_key) when known. */
    categoryKey?: string;
    fieldType?: string;
    valueType?: CanonicalDataValueType;
    displayHint?: "text" | "status_pill" | "date" | "money" | "link" | "compact_list";
    isSystem: boolean;
    availability: CanonicalDataProviderAvailability;
    /** Canonical derivation provenance — seeds adapt; they do not own truth. */
    source?: CanonicalDataProviderSourceDerivation;
    /** Parent relationship when this provider is a relationship-derived leaf. */
    relationship?: RelationshipLeafBinding;
    /** Parent collection when this provider is a collection projection. */
    collectionProjection?: CollectionProjectionBinding;
    /** Resolver module owner path for diagnostics. */
    resolverOwner?: string;
    /** When true, provider exists only for legacy saved configs — not offered in new pickers. */
    legacyOnly?: boolean;
};

export type CanonicalDataProviderFilter = {
    consumer: CanonicalDataConsumerSurface;
    isWaitlist?: boolean;
    kinds?: readonly CanonicalDataProviderKind[];
    shapes?: readonly CanonicalDataShape[];
    includeLegacyOnly?: boolean;
    tenantFieldDefinitions?: readonly import("@/lib/layout/tenantLayoutFieldPickerCatalog").TenantFieldDefinitionRow[];
};
