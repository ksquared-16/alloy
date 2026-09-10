/**
 * What an authenticated application is allowed to do, and where.
 *
 * ── TWO INDEPENDENT QUESTIONS, KEPT INDEPENDENT ──
 *
 * A scope says WHAT; a boundary says WHERE. They are evaluated separately and
 * both must pass. The alternative — folding the location into the scope name, as
 * `attendance.location_A.write` — multiplies the catalogue by the tenant's
 * location count, makes a grant unreadable, and turns "add a location" into
 * "reissue every grant". `NonHumanProducerAuthority` already models these as
 * separate fields and `assertNonHumanCaptureAllowed` already denies on them
 * separately; this is the same decision, for the same reason.
 *
 * ── A SCOPE IS NECESSARY, NEVER SUFFICIENT ──
 *
 * Passing these checks means the platform will let the call through to the
 * domain. It does not mean the domain will accept it. Eligibility, service-day
 * rules, immutability triggers and every other invariant still run and still have
 * the final word. Nothing here is an authorization result for a domain.
 *
 * ── AN EMPTY GRANT DENIES ──
 *
 * No scopes means no scopes. An empty location list means no locations. The most
 * common half-provisioned state is an empty one, and it has to fail closed.
 */

import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

export type AuthorizationVerdict =
    | { readonly ok: true }
    | { readonly ok: false; readonly code: string; readonly message: string };

const ALLOW: AuthorizationVerdict = Object.freeze({ ok: true as const });

function deny(code: string, message: string): AuthorizationVerdict {
    return Object.freeze({ ok: false as const, code, message });
}

/**
 * Does this principal hold the scope?
 *
 * Exact string equality only. No prefix matching, no wildcard, no hierarchy: a
 * scope catalogue where `attendance` implies `attendance.write` is one where
 * granting a read quietly grants a write.
 */
export function hasScope(principal: ApplicationPrincipal, scope: string): boolean {
    const wanted = (scope ?? "").trim();
    if (!wanted) return false;
    return principal.grantedScopes.includes(wanted);
}

export function assertScope(principal: ApplicationPrincipal, scope: string): AuthorizationVerdict {
    return hasScope(principal, scope)
        ? ALLOW
        : deny("forbidden_scope", `This installation has not been granted ${scope}.`);
}

/**
 * May this principal act on this location?
 *
 * A resource id on its own is never authorization. The caller naming a location
 * is a request, not a permission — the answer comes from the installation's
 * boundary, which the caller cannot influence.
 */
export function locationAllowed(principal: ApplicationPrincipal, locationId: string | null | undefined): boolean {
    const wanted = (locationId ?? "").trim();
    if (!wanted) return false;
    if (principal.boundary.mode === "org_wide") return true;
    return principal.boundary.locationIds.includes(wanted);
}

export function assertLocation(
    principal: ApplicationPrincipal,
    locationId: string | null | undefined,
): AuthorizationVerdict {
    return locationAllowed(principal, locationId)
        ? ALLOW
        : deny("forbidden_resource", "This installation is not registered for that location.");
}

/**
 * Narrow a caller's requested locations to what the installation actually holds.
 *
 * Intersection, never rejection and never expansion. Asking for a location
 * outside the boundary yields nothing for that location rather than an error for
 * the whole request — the same semantics the attendance route already applies, so
 * that a partner asking too broadly gets less rather than everything.
 *
 * An `org_wide` installation returns the request unchanged; it is the domain
 * query's job to bound that to the organization, which it does through the
 * principal's orgId.
 */
export function narrowLocations(
    principal: ApplicationPrincipal,
    requested: readonly string[] | null | undefined,
): readonly string[] {
    const asked = (requested ?? []).map((l) => (l ?? "").trim()).filter(Boolean);

    if (principal.boundary.mode === "org_wide") return Object.freeze([...asked]);

    const held = principal.boundary.locationIds;
    // No request means "everything I hold", not "everything".
    if (asked.length === 0) return Object.freeze([...held]);
    return Object.freeze(asked.filter((l) => held.includes(l)));
}
