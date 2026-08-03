/**
 * The single entry point every public tour route uses — Slice C route convergence.
 *
 * Wraps `authorizeTourAction` with rate limiting and HTTP mapping so no route
 * reproduces any part of the authorization decision. A route says which action
 * it requires; everything else is decided here.
 *
 * `requiredActions` is a ROUTE constant. It is never read from the request, so
 * a caller cannot widen its own authority by changing a payload or a path.
 */

import type { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { decodePublicTourToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { takeTourPublicRateLimit, type TourPublicRateLimitKind } from "@/lib/tours/public/tourPublicRateLimit";
import { tourPublicErr, tourPublicRateLimited } from "@/lib/tours/public/tourPublicHttp";
import {
    authorizeTourAction,
    type TourActionAuthorization,
    type TourActionKind,
    type TourAuthFailureCode,
} from "@/lib/tours/public/authorizeTourAction";

/**
 * HTTP status per failure. Deliberately coarse: 404 for anything that should
 * look like "no such link" and 403 for a link that exists but is spent. A
 * per-cause status would leak the same signal the uniform message hides.
 */
const STATUS: Record<TourAuthFailureCode, number> = {
    invalid: 404,
    expired: 403,
    revoked: 403,
    consumed: 409,
    // These are forgery-shaped. They must be indistinguishable from "not found".
    wrong_action: 404,
    recipient_mismatch: 404,
    context_mismatch: 404,
    legacy_unscoped: 403,
};

export type TourRouteGuardResult =
    | { ok: true; auth: Extract<TourActionAuthorization, { ok: true }>; supabase: ReturnType<typeof createServiceRoleClient> }
    | { ok: false; response: Response };

/**
 * Authorize a public tour request.
 *
 * `requiredActions` may list more than one kind where a route legitimately
 * serves several — e.g. availability is readable by a viewing credential AND by
 * a reschedule credential. It is still a closed list owned by the route.
 */
export async function guardTourActionRoute(args: {
    request: NextRequest;
    rawToken: string;
    /** Must be a rate-limit kind: a route with no budget is a 500, not an open route. */
    routeName: TourPublicRateLimitKind;
    requiredActions: readonly TourActionKind[];
    /**
     * Opt in to serving an already-spent credential as a replay. The route MUST then
     * check `auth.replay` and return the existing result rather than mutating again.
     */
    allowConsumedReplay?: boolean;
}): Promise<TourRouteGuardResult> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false, response: tourPublicErr("Server misconfiguration", 500) };
    }

    const token = decodePublicTourToken(args.rawToken ?? "");

    const retry = takeTourPublicRateLimit(args.request, args.routeName, token);
    if (retry != null) {
        return { ok: false, response: tourPublicRateLimited(retry) };
    }

    const supabase = createServiceRoleClient();

    // Try each permitted kind. The token carries exactly one, so at most one
    // attempt can succeed — this is not a widening, it is the route declaring
    // which single kinds it serves.
    let lastFailure: Extract<TourActionAuthorization, { ok: false }> | null = null;
    for (const requiredAction of args.requiredActions) {
        const auth = await authorizeTourAction({
            supabase,
            plaintextToken: token,
            requiredAction,
            allowConsumedReplay: args.allowConsumedReplay,
        });
        if (auth.ok) return { ok: true, auth, supabase };
        // A non-action failure (expired, revoked, recipient mismatch) is the
        // real reason and should win over "wrong_action" from a sibling attempt.
        if (auth.code !== "wrong_action" || !lastFailure) lastFailure = auth;
    }

    const failure = lastFailure ?? { ok: false as const, code: "invalid" as const, message: "This link is no longer valid." };
    return {
        ok: false,
        response: tourPublicErr(failure.message, STATUS[failure.code] ?? 400, { code: failure.code }),
    };
}
