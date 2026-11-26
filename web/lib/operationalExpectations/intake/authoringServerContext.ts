/**
 * Trusted-context + permission resolution for the authoring intake (P1 · Wave B).
 *
 * The production entry NEVER accepts a caller-constructed identity. It resolves the
 * org, actor, and permission from the canonical admin access context
 * (`getAdminAccessContextCached`) — client input supplies none of them. This pure
 * resolver is split out so the permission gate is unit-testable without the auth
 * cache.
 *
 * PERMISSION: authoring an Operational Expectation requires the DEDICATED governed
 * capability `operational_expectations.author` (seeded into the RBAC catalog +
 * granted by default only to the org `admin` role — migration
 * 20260720000000_operational_expectations_author_permission_and_idempotency.sql).
 * It is a SEPARATE capability from workflow authoring: `workflows.write` does NOT
 * grant it. Possession of service-role credentials is DB infrastructure, never
 * application authorization.
 */

import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";
import type {
    AuthoringContext,
    AuthoringResult,
} from "@/lib/operationalExpectations/intake/authoringTypes";

/** The dedicated governed capability required to author an Operational Expectation. */
export const OE_AUTHOR_PERMISSION_KEY = "operational_expectations.author";

export type ResolvedAuthoringContext =
    | { ok: true; context: AuthoringContext }
    | { ok: false; result: AuthoringResult };

/**
 * Turn a resolved admin access context into a trusted AuthoringContext, enforcing
 * authentication + the authoring capability. A caller with server execution access
 * but WITHOUT the capability is rejected. Client input contributes nothing here.
 */
export function resolveAuthoringContext(access: AdminAccessContextResult): ResolvedAuthoringContext {
    if (!access.ok) {
        return { ok: false, result: { status: "rejected", code: "unauthorized", message: "Authentication is required to author." } };
    }
    if (!access.permissionKeys.includes(OE_AUTHOR_PERMISSION_KEY)) {
        return { ok: false, result: { status: "rejected", code: "unauthorized", message: "The authoring capability is required." } };
    }
    return {
        ok: true,
        context: {
            orgId: access.orgId,
            actorUserId: access.userId,
            actorLabel: null,
            actorAuthenticated: true,
        },
    };
}
