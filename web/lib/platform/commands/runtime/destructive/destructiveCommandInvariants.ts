/**
 * Destructive / replacement policy invariants (P4.S1).
 */

import type { DestructiveCommandPolicy } from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";
import type { CommandImpactPreview } from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";
import { listDestructiveCommandPolicies } from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

function isStrictEnv(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function assertDestructivePolicyInvariants(policy: DestructiveCommandPolicy): void {
    const errors: string[] = [];
    if (policy.requiresPreview !== true) {
        errors.push("requiresPreview must be true");
    }
    if (policy.confirmation === ("none" as string)) {
        errors.push("destructive confirmation cannot be none");
    }
    if (policy.impactClass === "replace" && !policy.requiresDisplacedImpact) {
        errors.push("replace requires displaced impact");
    }
    if (!policy.capabilityKey.trim()) {
        errors.push("capabilityKey required");
    }
    if (errors.length === 0) return;
    const message = `[destructivePolicy] invariants failed for ${policy.capabilityKey}: ${errors.join("; ")}`;
    if (isStrictEnv()) throw new Error(message);
    console.error(message);
}

export function assertDestructivePreviewInvariants(
    preview: CommandImpactPreview,
    policy: DestructiveCommandPolicy
): void {
    const errors: string[] = [];
    if (preview.capabilityKey !== policy.capabilityKey) {
        errors.push("preview capabilityKey mismatch");
    }
    if (preview.impactClass !== policy.impactClass) {
        errors.push("preview impactClass mismatch");
    }
    if (preview.confirmation.policy !== policy.confirmation) {
        errors.push("preview confirmation policy mismatch");
    }
    if (!preview.previewToken.trim()) {
        errors.push("previewToken required");
    }
    if (preview.previewToken.includes("affectedRecords")) {
        errors.push("previewToken must not embed raw preview payload");
    }
    if (policy.requiresDisplacedImpact) {
        const hasDemoted = preview.affectedRecords.some((r) => r.effect === "demoted");
        const hasPromoted = preview.affectedRecords.some((r) => r.effect === "promoted");
        if (!hasDemoted || !hasPromoted) {
            errors.push("replace preview must include promoted and demoted effects");
        }
    }
    // Operator-safe: no stack-like strings in messages
    for (const w of preview.warnings) {
        if (/at\s+\S+\s+\(|stack|postgres|sqlstate/i.test(w.message)) {
            errors.push(`warning leaked diagnostics: ${w.code}`);
        }
    }
    if (errors.length === 0) return;
    const message = `[destructivePreview] invariants failed: ${errors.join("; ")}`;
    if (isStrictEnv()) throw new Error(message);
    console.error(message);
}

export function assertDestructivePolicyRegistryIntegrity(): void {
    for (const policy of listDestructiveCommandPolicies()) {
        assertDestructivePolicyInvariants(policy);
    }
}
