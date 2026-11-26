/**
 * Operator-safe impact preview contract (P4.S1).
 * Domain adapters supply content; shared runtime validates policy/freshness.
 */

import type {
    CommandImpactClass,
    CommandReversibility,
    DestructiveConfirmationPolicy,
    DestructiveRecovery,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";

export type CommandImpactEffect =
    | "deleted"
    | "archived"
    | "deactivated"
    | "removed"
    | "revoked"
    | "cancelled"
    | "withdrawn"
    | "ended"
    | "voided"
    | "promoted"
    | "demoted"
    | "updated";

export type CommandImpactAffectedRecord = {
    type: string;
    id?: string;
    label?: string;
    effect: CommandImpactEffect;
};

export type CommandImpactPreview = {
    previewId: string;
    capabilityKey: string;
    generatedAt: string;
    subject: {
        type: string;
        id: string;
        label?: string;
    };
    impactClass: CommandImpactClass;
    reversibility: CommandReversibility;
    affectedRecords: readonly CommandImpactAffectedRecord[];
    warnings: readonly { code: string; message: string }[];
    blockers: readonly { code: string; message: string }[];
    downstreamEffects: readonly { type: string; description: string }[];
    confirmation: {
        policy: DestructiveConfirmationPolicy;
        /** Expected typed phrase when policy is typed_confirm — never a secret. */
        typedValue?: string;
    };
    recovery: DestructiveRecovery & { description?: string };
    freshness: {
        strategy: "same_request" | "ttl" | "version_match";
        version?: string;
        expiresAt?: string;
    };
    /**
     * Tamper-resistant correlation token (HMAC). Opaque to clients —
     * does not embed full preview payload.
     */
    previewToken: string;
};
