/**
 * Configuration Object Runtime — typed contracts (Checkpoint C.5).
 *
 * Product composition layer for Organization-authored objects with durable
 * identity. Composes on Configuration Continuity; does not replace it.
 *
 * Domain implementations own schema, APIs, mutations, and semantics.
 * This module owns reusable identity/collection/selection/concern/overview/
 * editing/lifecycle *contracts* and projection helpers.
 *
 * @see docs/audits/active/configuration-object-runtime-checkpoint-c5-2026-07.md
 * @see docs/platform/operator/configuration-workspace-platform-doctrine.md
 */

/** Stable domain key — Programs, Tuition structures, Funding definitions, etc. */
export type ConfigurationObjectDomainId = string;

export type ConfigurationObjectLifecycleStatus =
    | "active"
    | "inactive"
    | "draft"
    | "retired"
    | "unknown";

export type ConfigurationObjectPublicationState =
    | "none"
    | "draft_only"
    | "published"
    | "changes_ready";

/**
 * Identity — what the operator recognizes as "this object".
 * Domains map their rows into this shape; the runtime never invents IDs.
 */
export type ConfigurationObjectIdentity = {
    domainId: ConfigurationObjectDomainId;
    objectId: string;
    objectType: string;
    displayName: string;
    secondaryIdentity?: string | null;
    lifecycleStatus: ConfigurationObjectLifecycleStatus;
    ownershipScopeLabel?: string | null;
    versionLabel?: string | null;
};

/** Collection row projection — feeds ConfigCollectionRail / object selectors. */
export type ConfigurationObjectCollectionItem = {
    id: string;
    label: string;
    supportingLabel?: string | null;
    hasAttention: boolean;
    lifecycleStatus?: ConfigurationObjectLifecycleStatus;
    publicationState?: ConfigurationObjectPublicationState;
    publicationLabel?: string;
    assignmentLabel?: string | null;
    isAssigned?: boolean;
};

export type ConfigurationObjectConcernCapability =
    | "overview"
    | "relationships"
    | "history"
    | "publication"
    | "distribution"
    | "assignment"
    | "activation"
    | "domain";

export type ConfigurationObjectConcernDefinition = {
    key: string;
    label: string;
    order: number;
    capability: ConfigurationObjectConcernCapability;
    /** When false, concern is hidden (not merely disabled). */
    visible: boolean;
    /** Permission key the domain evaluates — runtime only filters on boolean. */
    permissionAllowed: boolean;
    supportsItemId?: boolean;
    badgeCount?: number | null;
    /** Continuity / collection invalidation reasons this concern listens for. */
    invalidationReasons?: readonly string[];
};

export type ConfigurationObjectOverviewRegionKey =
    | "identity_and_state"
    | "summary"
    | "key_relationships"
    | "usage"
    | "lifecycle"
    | "recent_changes"
    | "attention"
    | "primary_action";

export type ConfigurationObjectOverviewRegion = {
    key: ConfigurationObjectOverviewRegionKey;
    title?: string;
    /** Domains supply content; platform owns region order. */
    present: boolean;
};

/** Default Overview region order — read-first, not a form. */
export const CONFIGURATION_OBJECT_OVERVIEW_REGION_ORDER: readonly ConfigurationObjectOverviewRegionKey[] = [
    "identity_and_state",
    "summary",
    "attention",
    "key_relationships",
    "usage",
    "lifecycle",
    "recent_changes",
    "primary_action",
] as const;

export type ConfigurationObjectEditMode = "read" | "edit";

export type ConfigurationObjectEditSession<TDraft = Record<string, unknown>> = {
    mode: ConfigurationObjectEditMode;
    draft: TDraft | null;
    dirty: boolean;
    saving: boolean;
    validationErrors: ReadonlyArray<{ field: string; message: string }>;
    saveError: string | null;
};

export type ConfigurationObjectActionPlacement =
    | "collection_create"
    | "header_primary"
    | "header_overflow"
    | "concern"
    | "row_secondary";

export type ConfigurationObjectAction = {
    id: string;
    label: string;
    placement: ConfigurationObjectActionPlacement;
    /** Registered mutation path or bounded command id — never an unbound handler token. */
    mutationKey: string;
    enabled: boolean;
    destructive?: boolean;
};

/** Optional lifecycle capability slots — domains implement; runtime only composes. */
export type ConfigurationObjectLifecycleSlots = {
    assignment?: boolean;
    publication?: boolean;
    distribution?: boolean;
    activation?: boolean;
    history?: boolean;
};

export type ConfigurationObjectWorkspaceDescriptor = {
    domainId: ConfigurationObjectDomainId;
    objectTypeLabel: string;
    collectionLabel: string;
    basePath: string;
    objectIdQueryParam: string;
    concernQueryParam: string;
    itemIdQueryParam?: string;
    defaultConcernKey: string;
    lifecycleSlots: ConfigurationObjectLifecycleSlots;
    concerns: readonly ConfigurationObjectConcernDefinition[];
};

export type ConfigurationObjectSelectionSource = "route" | "retained" | "none";

export type ConfigurationObjectSelectionResolution = {
    objectId: string | null;
    source: ConfigurationObjectSelectionSource;
    error: string | null;
    shouldSyncRoute: boolean;
};
