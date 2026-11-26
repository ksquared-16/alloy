/**
 * Destructive permission-class seam (P4.S1).
 *
 * Availability ≠ authorization. Floor remains requireAdminOrOps at routes.
 * This seam records the declared permission class and a fail-closed decision
 * without inventing new organization permission keys.
 */

import type { DestructivePermissionClass } from "@/lib/platform/commands/runtime/destructive/destructivePolicyTypes";
import { getDestructiveCommandPolicy } from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";

export type DestructivePermissionDecision = {
    allowed: boolean;
    permissionClass: DestructivePermissionClass;
    reasonCode?: string;
    /** Always false in P4.S1 — full permission product not evaluated here. */
    authorizationProductEvaluated: false;
};

/**
 * Server-owned permission-class check.
 * Client-supplied permissionClass is ignored.
 *
 * P4.S1 behavior: if a policy exists and the caller is already in a trusted
 * server context (`trustedServerContext: true`), allow the *class declaration*
 * for preparation/preview planning. Commit remains separately disabled.
 * Missing policy or untrusted context → fail closed.
 */
export function evaluateDestructivePermissionClass(input: {
    capabilityKey: string;
    /** Must be true only after route-level admin/ops (or equivalent) succeeded. */
    trustedServerContext: boolean;
    /** Ignored — never authoritative. */
    clientPermissionClass?: string | null;
}): DestructivePermissionDecision {
    void input.clientPermissionClass;
    const policy = getDestructiveCommandPolicy(input.capabilityKey);
    if (!policy) {
        return {
            allowed: false,
            permissionClass: "sensitive_destructive",
            reasonCode: "missing_destructive_policy",
            authorizationProductEvaluated: false,
        };
    }
    if (!input.trustedServerContext) {
        return {
            allowed: false,
            permissionClass: policy.permissionClass,
            reasonCode: "untrusted_context",
            authorizationProductEvaluated: false,
        };
    }
    return {
        allowed: true,
        permissionClass: policy.permissionClass,
        authorizationProductEvaluated: false,
    };
}
