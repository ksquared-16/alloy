/**
 * Trusted-context + permission resolution for ratification (P1 · Wave C · C2).
 *
 * The production entry NEVER accepts a caller-constructed identity. Org, actor, and
 * the DEDICATED ratify capability are resolved from the canonical admin access
 * context. This pure resolver makes the permission gate unit-testable.
 *
 * PERMISSION: ratification requires `operational_expectations.ratify` — a governed
 * capability DISTINCT from `operational_expectations.author`. Authoring permission
 * does NOT grant ratification authority; `workflows.write` does not either; and
 * possession of service-role credentials is DB infrastructure, never authority.
 * Because this capability is only granted to human operator roles (admin-default)
 * and resolves from a human session, an AI/model author can never self-ratify.
 */

import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";
import type {
    RatificationContext,
    RatificationResult,
} from "@/lib/operationalExpectations/ratification/ratificationTypes";

/** The dedicated governed capability required to ratify an Operational Expectation. */
export const OE_RATIFY_PERMISSION_KEY = "operational_expectations.ratify";

export type ResolvedRatificationContext =
    | { ok: true; context: RatificationContext }
    | { ok: false; result: RatificationResult };

/**
 * Turn a resolved admin access context into a trusted RatificationContext,
 * enforcing authentication + the ratify capability. A caller with authoring access
 * (or workflows.write, or mere server execution) but WITHOUT the ratify capability
 * is rejected. Client input contributes nothing.
 */
export function resolveRatificationContext(access: AdminAccessContextResult): ResolvedRatificationContext {
    if (!access.ok) {
        return { ok: false, result: { status: "rejected", code: "unauthorized", message: "Authentication is required to ratify." } };
    }
    if (!access.permissionKeys.includes(OE_RATIFY_PERMISSION_KEY)) {
        return { ok: false, result: { status: "rejected", code: "unauthorized", message: "The ratification capability is required." } };
    }
    return {
        ok: true,
        context: {
            orgId: access.orgId,
            actorUserId: access.userId,
            actorLabel: null,
            // The ratifier acts under their user authority; recorded for the audit log.
            ratifierAuthorityKey: `user:${access.userId}`,
            actorAuthenticated: true,
        },
    };
}
