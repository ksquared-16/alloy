/**
 * Trusted-context + permission resolution for the authoring intake (P1 · Wave B).
 *
 * The production entry NEVER accepts a caller-constructed identity. It resolves the
 * org, actor, and permission from the canonical admin access context
 * (`getAdminAccessContextCached`) — client input supplies none of them. This pure
 * resolver is split out so the permission gate is unit-testable without the auth
 * cache.
 *
 * PERMISSION: the frozen corpus does not (yet) name a dedicated authoring
 * capability, so Wave B enforces the closest ALREADY-GOVERNED capability —
 * `workflows.write` — because Operational Expectations is the authored intent layer
 * over operational processes/workflows (which the unified gap→effector binding
 * generalizes). This is an INTERIM binding; a dedicated
 * `operational_expectations.author` capability is a governed follow-up (an
 * implementation-contract gap, flagged — not a broad admin bypass). Possession of
 * service-role credentials is DB infrastructure, never application authorization.
 */

import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";
import type {
    AuthoringContext,
    AuthoringResult,
} from "@/lib/operationalExpectations/intake/authoringTypes";

/** Interim governed capability required to author an Operational Expectation. */
export const OE_AUTHOR_PERMISSION_KEY = "workflows.write";

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
