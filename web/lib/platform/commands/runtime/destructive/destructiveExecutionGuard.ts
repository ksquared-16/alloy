/**
 * Destructive / replacement execution guard (P4.S1 / P4.S2).
 *
 * Preview framework: enabled.
 * Commit through Command Runtime: fail-closed except exact allowlisted keys.
 * P4.S2: make_primary_contact only.
 */

import {
    DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive/destructiveFacadeAllowlist";
import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

/** Global switch remains false — exact keys override via allowlist. */
export const DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED = false as const;
export const DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED = true as const;

export {
    DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive/destructiveFacadeAllowlist";

export type DestructiveCommitGuardResult =
    | { allowed: true; code: "allowlisted" }
    | { allowed: false; code: "commit_globally_disabled"; message: string }
    | { allowed: false; code: "not_destructive_policy"; message: string }
    | { allowed: false; code: "preview_framework_disabled"; message: string };

/**
 * Fail closed unless the capability is on the exact P4 allowlist.
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
    if (isDestructiveFacadeCommitAllowlisted(input.capabilityKey)) {
        return { allowed: true, code: "allowlisted" };
    }
    if (!DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED) {
        return {
            allowed: false,
            code: "commit_globally_disabled",
            message:
                "Destructive and replacement Commands cannot commit through the Command Runtime yet.",
        };
    }
    return {
        allowed: false,
        code: "commit_globally_disabled",
        message:
            "Destructive and replacement Commands cannot commit through the Command Runtime yet.",
    };
}

export function isDestructiveFacadeCommitEnabled(): boolean {
    return (
        Boolean(DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED) ||
        DESTRUCTIVE_FACADE_COMMIT_ALLOWLIST.length > 0
    );
}

/** True when this specific capability may commit through the facade. */
export function isDestructiveCapabilityCommitEnabled(capabilityKey: string): boolean {
    return assertDestructiveCommitAllowed({ capabilityKey }).allowed === true;
}
