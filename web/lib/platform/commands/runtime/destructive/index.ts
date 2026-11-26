/**
 * Destructive / replacement Command safety foundation (P4.S1).
 */

export type {
    CommandImpactClass,
    CommandReversibility,
    DestructiveCommandPolicy,
    DestructiveConfirmationPolicy,
    DestructivePermissionClass,
    DestructivePreparationState,
    DestructivePreviewFreshness,
    DestructiveRecovery,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";

export type {
    CommandImpactAffectedRecord,
    CommandImpactEffect,
    CommandImpactPreview,
} from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";

export {
    getDestructiveCommandPolicy,
    isDestructiveOrReplacementCapability,
    listDestructiveCommandPolicies,
    requireDestructiveCommandPolicy,
    toDestructivePreparationState,
    tryResolveDestructiveCommandPolicy,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

export {
    DESTRUCTIVE_PREVIEW_TOKEN_IS_NOT_IDEMPOTENCY_KEY,
    issueDestructivePreviewToken,
    validateDestructivePreviewToken,
} from "@/lib/platform/commands/runtime/destructive/destructivePreviewToken";
export type {
    DestructivePreviewTokenClaims,
    DestructivePreviewTokenIssueInput,
    DestructivePreviewTokenValidation,
} from "@/lib/platform/commands/runtime/destructive/destructivePreviewToken";

export {
    evaluateDestructivePermissionClass,
} from "@/lib/platform/commands/runtime/destructive/destructivePermissionSeam";
export type { DestructivePermissionDecision } from "@/lib/platform/commands/runtime/destructive/destructivePermissionSeam";

export {
    assertDestructiveCommitAllowed,
    DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED,
    DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST,
    DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED,
    isDestructiveCapabilityCommitEnabled,
    isDestructiveFacadeCommitAllowlisted,
    isDestructiveFacadeCommitEnabled,
} from "@/lib/platform/commands/runtime/destructive/destructiveExecutionGuard";

export {
    createDestructiveFixtureAdapter,
    fixtureKindForPolicy,
} from "@/lib/platform/commands/runtime/destructive/destructiveCommandAdapter";
export type {
    DestructiveAdapterCommitInput,
    DestructiveAdapterPreviewInput,
    DestructiveCommandAdapter,
} from "@/lib/platform/commands/runtime/destructive/destructiveCommandAdapter";

export {
    assertDestructivePolicyInvariants,
    assertDestructivePolicyRegistryIntegrity,
    assertDestructivePreviewInvariants,
} from "@/lib/platform/commands/runtime/destructive/destructiveCommandInvariants";
