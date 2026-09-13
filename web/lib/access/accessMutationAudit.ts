import { randomUUID } from "node:crypto";

import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

/**
 * What the access transaction owners need in order to record WHO changed access.
 *
 * The six access mutation RPCs refuse a change that names no actor — deliberately, because
 * `mutation_events.origin` already distinguishes a system change from a human one and *"do not infer
 * system vs operator from absence of a name"*. So the actor is not optional plumbing; without it the
 * mutation does not happen. This module is the one place the routes get it from.
 */
export type AccessMutationAudit = {
    /** `mutation_events.operator_id`. */
    actorUserId: string;
    /** `mutation_events.origin`. */
    origin: AccessMutationOrigin;
    /** `context_payload.correlation_id` — one per request, shared by every event that request causes. */
    correlationId: string;
};

export type AccessMutationOrigin = "operator" | "api" | "automation" | "system";

/**
 * ONE TRUTHFUL ORIGIN FOR THE ADMIN ROUTES, NOT A GUESS ABOUT THE CALLER.
 *
 * These six routes serve the mounted Access & Identity product AND direct authenticated API calls —
 * the same handler, the same authorization, the same effect. Nothing in the request distinguishes a
 * browser from `curl` except headers a caller controls, so branching on them would put a value in
 * permanent history that the caller chose. `operator` is the honest description of what both are: a
 * human-authorised access change through the operator API.
 *
 * `system` stays reserved for changes an automated owner actually authors, and it is passed
 * explicitly by that owner rather than inferred from a missing actor.
 */
export const OPERATOR_ORIGIN: AccessMutationOrigin = "operator";

/**
 * Derive the audit context from the AUTHENTICATED server context.
 *
 * The actor is `access.userId` — the principal the gate already resolved — and never anything the
 * client sent. A request body cannot name its own author: that is the whole point of recording one.
 *
 * **The correlation id is minted here, and that is reuse rather than a second tracing system.**
 * `actionExecutor` mints `randomUUID()` per invocation and carries it as `correlationId`; these
 * routes do not pass through it, and the platform has no request-scoped id of its own. Minting one
 * per request with the same convention is what lets a single operator action that causes several
 * events — creating a role WITH its initial package produces `access.role.created` and
 * `access.role.grants_changed` — be read back as one action instead of two coincidences. Callers
 * that already hold a canonical correlation id pass it in rather than getting a new one.
 */
export function accessMutationAudit(
    access: Pick<AdminAccessContextSuccess, "userId">,
    options: { correlationId?: string | null; origin?: AccessMutationOrigin } = {}
): AccessMutationAudit {
    return {
        actorUserId: access.userId,
        origin: options.origin ?? OPERATOR_ORIGIN,
        correlationId: options.correlationId || randomUUID(),
    };
}
