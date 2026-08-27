/**
 * The public origin used to build no-login action URLs.
 *
 * DELIBERATELY IGNORES THE REQUEST.
 *
 * This used to fall back to the request's own origin when no public app URL was
 * configured, on the reasoning that a preview or certification host should still produce
 * links that work on that host. That reasoning is wrong for a link that leaves the
 * building: these URLs are rendered into emails and texts sent to families, so their
 * origin must be a property of the ENVIRONMENT, not of whichever host the caller reached.
 * A request-derived origin is also a `Host`/`X-Forwarded-Host` header away from being
 * attacker-controlled, which would let a spoofed header decide where a parent's booking
 * link points.
 *
 * There is now one authority — {@link resolvePublicAppOrigin} — and this is a thin,
 * named seam onto it for the tour public routes.
 */

import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

/**
 * The canonical public origin, or `""` when it cannot be resolved.
 *
 * Callers treat `""` as "offer no absolute link" rather than inventing one:
 * `buildTourParentActionModel` returns all-null actions, and a template omits the line.
 * Silence is the correct degradation; a link to the wrong host is not.
 */
export function resolvePublicBaseUrl(): string {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : "";
}
