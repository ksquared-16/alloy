/**
 * Destructive / replacement execution guard (P4.S1).
 *
 * Preview framework: enabled (contract + test fixtures).
 * Commit through Command Runtime: globally disabled.
 */

import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

/** Explicit P4.S1 switches. */
export const DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED = true as const;
export const DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED = false as const;

export type DestructiveCommitGuardResult =
    | { allowed: false; code: "commit_globally_disabled"; message: string }
    | { allowed: false; code: "not_destructive_policy"; message: string }
    | { allowed: false; code: "preview_framework_disabled"; message: string };

/**
 * Fail closed: no destructive/replacement capability may commit through the facade in P4.S1.
 */
export function assertDestructiveCommitAllowed(input: {
    capabilityKey: string;
}): DestructiveCommitGuardResult {
    if (!DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED) {
        return {
            allowed: false,
            code: "preview_framework_disabled",
            message: "Destructive preview framework is disabled.",
        };
    }
    if (!isDestructiveOrReplacementCapability(input.capabilityKey)) {
        return {
            allowed: false,
            code: "not_destructive_policy",
            message: "Capability is not registered as destructive/replacement.",
        };
    }
    // P4.S1 hard stop — always.
    if (!DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED) {
        return {
            allowed: false,
            code: "commit_globally_disabled",
            message:
                "Destructive and replacement Commands cannot commit through the Command Runtime yet.",
        };
    }
    // Unreachable while commit flag is false; keeps type exhaustive for later slices.
    return {
        allowed: false,
        code: "commit_globally_disabled",
        message:
            "Destructive and replacement Commands cannot commit through the Command Runtime yet.",
    };
}

export function isDestructiveFacadeCommitEnabled(): boolean {
    return Boolean(DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED);
}
