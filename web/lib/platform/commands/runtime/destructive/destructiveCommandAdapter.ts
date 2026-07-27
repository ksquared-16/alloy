/**
 * Destructive Command adapter seam (P4.S1).
 *
 * Domains will implement preview/commit. Shared runtime validates policy + freshness.
 * Production commit remains disabled by destructiveExecutionGuard.
 */

import type { CommandImpactPreview } from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";
import type { DestructiveCommandPolicy } from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";
import { issueDestructivePreviewToken } from "@/lib/platform/commands/runtime/destructive/destructivePreviewToken";
import { getDestructiveCommandPolicy } from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

export type DestructiveAdapterPreviewInput = {
    policy: DestructiveCommandPolicy;
    orgId: string;
    subjectType: string;
    subjectId: string;
    subjectLabel?: string;
    /** Opaque domain version/fingerprint for stale protection. */
    domainVersion: string;
    /** Actor for audit planning only — preview must not mutate. */
    actorUserId?: string | null;
};

export type DestructiveAdapterCommitInput = {
    policy: DestructiveCommandPolicy;
    orgId: string;
    subjectType: string;
    subjectId: string;
    previewToken: string;
    domainVersion: string;
    confirmation: { confirmed: boolean; confirmationValue?: string };
    actorUserId?: string | null;
};

/**
 * Domain adapter contract. Preview is read-only.
 * Commit must never be invoked for production in P4.S1 (guard fails closed).
 */
export interface DestructiveCommandAdapter {
    preview(input: DestructiveAdapterPreviewInput): Promise<CommandImpactPreview>;
    /**
     * Reserved for later slices. Implementations must not be registered for
     * production commit while DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED is false.
     */
    commit(input: DestructiveAdapterCommitInput): Promise<{ ok: false; code: string; message: string }>;
}

function ttlSeconds(policy: DestructiveCommandPolicy): number {
    if (policy.previewFreshness.mode === "ttl") return policy.previewFreshness.seconds;
    if (policy.previewFreshness.mode === "same_request") return 60;
    return 300;
}

function freshnessStrategy(
    policy: DestructiveCommandPolicy
): CommandImpactPreview["freshness"]["strategy"] {
    return policy.previewFreshness.mode;
}

/** Test-only / contract fixtures — do not wire to production routes. */
export function createDestructiveFixtureAdapter(
    kind: "delete" | "archive" | "replace"
): DestructiveCommandAdapter {
    return {
        async preview(input) {
            const policy = input.policy;
            const { previewId, token, claims } = issueDestructivePreviewToken({
                capabilityKey: policy.capabilityKey,
                subjectType: input.subjectType,
                subjectId: input.subjectId,
                orgId: input.orgId,
                impactClass: policy.impactClass,
                confirmation: policy.confirmation,
                version: input.domainVersion,
                ttlSeconds: ttlSeconds(policy),
            });

            const base: CommandImpactPreview = {
                previewId,
                capabilityKey: policy.capabilityKey,
                generatedAt: new Date(claims.iat * 1000).toISOString(),
                subject: {
                    type: input.subjectType,
                    id: input.subjectId,
                    label: input.subjectLabel,
                },
                impactClass: policy.impactClass,
                reversibility: policy.reversibility,
                affectedRecords: [],
                warnings: [],
                blockers: [],
                downstreamEffects: [],
                confirmation: {
                    policy: policy.confirmation,
                    typedValue:
                        policy.confirmation === "typed_confirm"
                            ? input.subjectLabel?.slice(0, 64) || "DELETE"
                            : undefined,
                },
                recovery: { ...policy.recovery },
                freshness: {
                    strategy: freshnessStrategy(policy),
                    version: input.domainVersion,
                    expiresAt: new Date(claims.exp * 1000).toISOString(),
                },
                previewToken: token,
            };

            if (kind === "delete") {
                return {
                    ...base,
                    affectedRecords: [
                        {
                            type: input.subjectType,
                            id: input.subjectId,
                            label: input.subjectLabel,
                            effect: "deleted",
                        },
                        {
                            type: "dependent_record",
                            label: "Related operational records (summarized)",
                            effect: "deleted",
                        },
                    ],
                    warnings: [
                        {
                            code: "irreversible",
                            message: "This deletion cannot be undone.",
                        },
                    ],
                    recovery: { kind: "none", description: "No restore path." },
                };
            }

            if (kind === "archive") {
                return {
                    ...base,
                    affectedRecords: [
                        {
                            type: input.subjectType,
                            id: input.subjectId,
                            label: input.subjectLabel,
                            effect: "archived",
                        },
                    ],
                    downstreamEffects: [
                        {
                            type: "history_retained",
                            description: "Historical records remain available for restore.",
                        },
                    ],
                    recovery: {
                        kind: "restore",
                        description: "May be restored by an authorized operator.",
                    },
                };
            }

            // replace
            return {
                ...base,
                affectedRecords: [
                    {
                        type: "person",
                        id: input.subjectId,
                        label: input.subjectLabel ?? "Selected contact",
                        effect: "promoted",
                    },
                    {
                        type: "person",
                        id: "previous-primary",
                        label: "Current primary contact",
                        effect: "demoted",
                    },
                    {
                        type: "opportunity_projection",
                        label: "Open opportunities on this account",
                        effect: "updated",
                    },
                ],
                warnings: [
                    {
                        code: "prior_contact_remains_linked",
                        message:
                            "The previous primary contact remains linked as an additional household contact.",
                    },
                ],
                downstreamEffects: [
                    {
                        type: "queue_display",
                        description: "Lead/queue primary contact display may update.",
                    },
                ],
                recovery: {
                    kind: "restore",
                    description: "Another Make Primary Contact can reassign designation.",
                },
            };
        },
        async commit() {
            return {
                ok: false,
                code: "commit_disabled",
                message: "Destructive commit is disabled in P4.S1.",
            };
        },
    };
}

/** Resolve fixture kind from policy impact class for contract tests. */
export function fixtureKindForPolicy(
    capabilityKey: string
): "delete" | "archive" | "replace" | null {
    const policy = getDestructiveCommandPolicy(capabilityKey);
    if (!policy) return null;
    if (policy.impactClass === "delete") return "delete";
    if (policy.impactClass === "archive") return "archive";
    if (policy.impactClass === "replace") return "replace";
    return null;
}
