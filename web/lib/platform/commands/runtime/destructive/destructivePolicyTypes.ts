/**
 * Destructive / replacement Command policy contract (P4.S1).
 *
 * Safety foundation only — no production commit through the Command Runtime.
 */

export type CommandImpactClass =
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

export type CommandReversibility =
    | "reversible"
    | "conditionally_reversible"
    | "irreversible";

/** Destructive confirmation cannot be `none`. */
export type DestructiveConfirmationPolicy =
    | "confirm"
    | "strong_confirm"
    | "typed_confirm";

export type DestructivePermissionClass =
    | "standard_destructive"
    | "sensitive_destructive"
    | "replacement"
    | "financial_destructive"
    | "access_destructive";

export type DestructivePreviewFreshness =
    | { mode: "same_request" }
    | { mode: "ttl"; seconds: number }
    | { mode: "version_match" };

export type DestructiveRecovery =
    | { kind: "restore" }
    | { kind: "recreate" }
    | { kind: "schedule_new" }
    | { kind: "manual_support" }
    | { kind: "none" };

/**
 * Server-owned policy for a destructive or replacement capability.
 * Client cannot supply or weaken these fields.
 */
export type DestructiveCommandPolicy = {
    capabilityKey: string;
    impactClass: CommandImpactClass;
    reversibility: CommandReversibility;
    confirmation: DestructiveConfirmationPolicy;
    permissionClass: DestructivePermissionClass;
    /** Always true for destructive/replacement — invariant. */
    requiresPreview: true;
    previewFreshness: DestructivePreviewFreshness;
    recovery: DestructiveRecovery;
    /**
     * When impactClass is replace, preview must identify displaced designation.
     * Enforced by invariants / fixture adapters.
     */
    requiresDisplacedImpact: boolean;
    /** Operator-safe one-liner for preparation surfaces. */
    operatorSummary: string;
};

/** Operator-safe preparation projection (no raw enums required in UI copy). */
export type DestructivePreparationState = {
    impactClass: CommandImpactClass;
    reversibility: CommandReversibility;
    requiresPreview: true;
    confirmation: DestructiveConfirmationPolicy;
    permissionClass: DestructivePermissionClass;
    recoveryKind: DestructiveRecovery["kind"];
    requiresDisplacedImpact: boolean;
    /** P4.S1: commit through facade is always false. */
    facadeCommitEnabled: false;
    operatorSummary: string;
};
