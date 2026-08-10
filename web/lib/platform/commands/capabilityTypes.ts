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

/**
 * Generic interaction hosts a capability may declare — where the operator interacts when
 * this capability runs inside a work surface. Not business- or action-name specific: the
 * client resolves the host from THIS declaration, never from the action key or label.
 */
export type CapabilityInteractionHost =
    | "inline_form"
    | "communications_composer"
    | "header_delegate"
    | "form_delivery";

/** Channel a `communications_composer` host opens on. Meaningless for other hosts. */
export type CapabilityComposerChannel = "email" | "sms";

export type CapabilityFamily =
    | "record_creation"
    | "status"
    | "enrollment"
    | "tours"
    | "relationships"
    | "communications"
    | "documents"
    | "scheduling"
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
    /**
     * Where the operator interacts when a work surface invokes this capability.
     * Omit to let the client route the capability through its execution owner —
     * for `registered_action`, that is a direct call to the Actions Runtime.
     * Declare a host only when the operator must go somewhere else first.
     */
    interactionHost?: CapabilityInteractionHost;
    /** Only meaningful with `interactionHost: "communications_composer"`. */
    composerDefaultChannel?: CapabilityComposerChannel;
    reason?: string;
};
