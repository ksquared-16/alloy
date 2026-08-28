/**
 * Platform Capability Registry — classification contract (P0.S1).
 *
 * Owns capability *identity honesty* (maturity, execution owner, catalog visibility).
 * Does **not** own mutation execution — Domain Executors / existing runtimes still do.
 *
 * @see qa/missions/commands-implementation-plan-msn_188e8bea6fb6de28dd21.md (P0.S1)
 * @see docs/platform/modules/actions-and-workflows.md
 */

/** How far this identity is from a trustworthy operator Command. */
export type CapabilityMaturity =
    | "executable"
    | "adapted"
    | "legacy"
    | "navigation_only"
    | "workflow_only"
    | "processing_only"
    | "configuration_maintenance"
    | "placeholder"
    | "unavailable";

/** Which runtime currently owns mutation / side effects for this identity. */
export type CapabilityExecutionOwner =
    | "registered_action"
    | "admin_action"
    | "mutation_runtime"
    | "relationship_runtime"
    | "tour_domain"
    | "processing_identity"
    | "scheduling_domain"
    | "navigation"
    | "workflow"
    | "configuration_runtime"
    | "none";

/**
 * Whether `/configuration/commands` (future) / Settings library may treat this as an
 * organization operational Command. Availability is not authorization.
 */
export type CapabilityCatalogVisibility =
    | "organization_command_catalog"
    | "internal_only"
    | "hidden";

export type CapabilityConfirmationPolicy =
    | "none"
    | "confirm"
    | "strong_confirm"
    | "typed_confirm"
    | "domain_owned";

export type CapabilityDestructiveKind =
    | "delete"
    | "archive"
    | "deactivate"
    | "remove"
    | "revoke"
    | "cancel"
    | "withdraw"
    | "end"
    | "void"
    | "replace";

export type CapabilityImplementationStatus = "production" | "partial" | "legacy" | "missing";

export type CapabilityFamily =
    | "record_creation"
    | "status"
    | "enrollment"
    | "tours"
    | "relationships"
    | "communications"
    | "documents"
    | "scheduling"
    // Money: what is owed and what is charged. Distinct from `scheduling`, which owns time, and from
    // `administration`, which owns configuration — a charge is neither.
    | "financial"
    // Medical facts about a person. Separate from `record` because access to it is separately
    // granted (D-H6) — a family with the same audience is exactly what that boundary rejects.
    | "health"
    | "destructive"
    | "administration"
    | "navigation"
    | "workflow"
    | "processing"
    | "configuration"
    | "unknown";

/**
 * Code-owned capability definition. Config rows (`action_definitions`) never imply
 * executable behavior without a matching registry entry that is not placeholder/unavailable.
 */
export type PlatformCapabilityDefinition = {
    /** Stable lookup key (operator / config key unless processing-namespaced). */
    capabilityKey: string;
    /** Canonical Command key after alias resolution. */
    canonicalCommandKey: string;
    operatorLabel: string;
    family: CapabilityFamily;
    maturity: CapabilityMaturity;
    executionOwner: CapabilityExecutionOwner;
    catalogVisibility: CapabilityCatalogVisibility;
    supportedSubjects: readonly string[];
    supportsPreview: boolean;
    confirmationPolicy: CapabilityConfirmationPolicy;
    destructiveKind?: CapabilityDestructiveKind;
    /** When executionOwner is registered_action — must match RegisteredAction.actionKey. */
    registeredActionKey?: string;
    /** Alternate keys that resolve to this canonical capability. */
    compatibilityAliases?: readonly string[];
    implementationStatus: CapabilityImplementationStatus;
    reason?: string;
};
