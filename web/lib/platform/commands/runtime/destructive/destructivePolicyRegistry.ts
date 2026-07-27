/**
 * Destructive / replacement policy registry (P4.S1).
 * Representative classifications only — no production facade commit.
 */

import type { DestructiveCommandPolicy } from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";
import { isDestructiveFacadeCommitAllowlisted } from "@/lib/platform/commands/runtime/destructive/destructiveFacadeAllowlist";

const POLICIES: readonly DestructiveCommandPolicy[] = [
    {
        capabilityKey: "delete_lead",
        impactClass: "delete",
        reversibility: "irreversible",
        confirmation: "typed_confirm",
        permissionClass: "sensitive_destructive",
        requiresPreview: true,
        previewFreshness: { mode: "ttl", seconds: 300 },
        recovery: { kind: "none" },
        requiresDisplacedImpact: false,
        operatorSummary: "Permanently deletes this lead and related operational data.",
    },
    {
        capabilityKey: "archive_lead",
        impactClass: "archive",
        reversibility: "reversible",
        confirmation: "strong_confirm",
        permissionClass: "standard_destructive",
        requiresPreview: true,
        previewFreshness: { mode: "ttl", seconds: 600 },
        recovery: { kind: "restore" },
        requiresDisplacedImpact: false,
        operatorSummary: "Archives this lead while retaining history.",
    },
    {
        capabilityKey: "make_primary_contact",
        impactClass: "replace",
        reversibility: "conditionally_reversible",
        confirmation: "strong_confirm",
        permissionClass: "replacement",
        requiresPreview: true,
        previewFreshness: { mode: "version_match" },
        recovery: { kind: "restore" },
        requiresDisplacedImpact: true,
        operatorSummary:
            "Promotes a household primary contact and demotes the previous primary designation.",
    },
    {
        capabilityKey: "cancel_tour",
        impactClass: "cancel",
        reversibility: "conditionally_reversible",
        confirmation: "strong_confirm",
        permissionClass: "standard_destructive",
        requiresPreview: true,
        previewFreshness: { mode: "ttl", seconds: 300 },
        recovery: { kind: "schedule_new" },
        requiresDisplacedImpact: false,
        operatorSummary: "Cancels the tour booking; a new booking may be scheduled later.",
    },
    {
        capabilityKey: "withdraw_child",
        impactClass: "withdraw",
        reversibility: "conditionally_reversible",
        confirmation: "strong_confirm",
        permissionClass: "sensitive_destructive",
        requiresPreview: true,
        previewFreshness: { mode: "ttl", seconds: 300 },
        recovery: { kind: "manual_support" },
        requiresDisplacedImpact: false,
        operatorSummary: "Withdraws the child from enrollment participation.",
    },
];

const BY_KEY = new Map(POLICIES.map((p) => [p.capabilityKey, p]));

function assertRegistryIntegrity(): void {
    const seen = new Set<string>();
    for (const policy of POLICIES) {
        if (seen.has(policy.capabilityKey)) {
            throw new Error(
                `[destructivePolicy] duplicate policy for "${policy.capabilityKey}"`
            );
        }
        seen.add(policy.capabilityKey);
        if (policy.requiresPreview !== true) {
            throw new Error(
                `[destructivePolicy] "${policy.capabilityKey}" must require preview`
            );
        }
        if (policy.impactClass === "replace" && !policy.requiresDisplacedImpact) {
            throw new Error(
                `[destructivePolicy] replace policy "${policy.capabilityKey}" must require displaced impact`
            );
        }
    }
}

assertRegistryIntegrity();

export function listDestructiveCommandPolicies(): readonly DestructiveCommandPolicy[] {
    return POLICIES;
}

export function getDestructiveCommandPolicy(
    capabilityKey: string
): DestructiveCommandPolicy | null {
    const key = (capabilityKey ?? "").trim();
    if (!key) return null;
    return BY_KEY.get(key) ?? null;
}

export function tryResolveDestructiveCommandPolicy(
    capabilityKey: string
):
    | { status: "known"; policy: DestructiveCommandPolicy }
    | { status: "unknown" } {
    const policy = getDestructiveCommandPolicy(capabilityKey);
    return policy ? { status: "known", policy } : { status: "unknown" };
}

/** Fail closed: unknown destructive classification has no policy. */
export function requireDestructiveCommandPolicy(
    capabilityKey: string
): DestructiveCommandPolicy {
    const policy = getDestructiveCommandPolicy(capabilityKey);
    if (!policy) {
        throw new Error(
            `[destructivePolicy] No destructive policy registered for "${capabilityKey}". Fail closed.`
        );
    }
    return policy;
}

export function isDestructiveOrReplacementCapability(capabilityKey: string): boolean {
    return getDestructiveCommandPolicy(capabilityKey) != null;
}

export function toDestructivePreparationState(
    policy: DestructiveCommandPolicy
): import("@/lib/platform/commands/runtime/destructive/destructivePolicyTypes").DestructivePreparationState {
    return {
        impactClass: policy.impactClass,
        reversibility: policy.reversibility,
        requiresPreview: true,
        confirmation: policy.confirmation,
        permissionClass: policy.permissionClass,
        recoveryKind: policy.recovery.kind,
        requiresDisplacedImpact: policy.requiresDisplacedImpact,
        facadeCommitEnabled: isDestructiveFacadeCommitAllowlisted(policy.capabilityKey),
        operatorSummary: policy.operatorSummary,
    };
}
