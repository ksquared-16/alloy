/**
 * What every /api/v1 route calls, and the only thing it needs to know.
 *
 * A handler asks for a principal, a scope, or a resource. It never parses an
 * Authorization header, never resolves an organization, and never reads a scope
 * array itself. That is the whole point: Thread 3 recorded what two resolvers for
 * one principal costs, and the way a platform acquires a second one is by letting
 * the first route do it inline "just this once".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAccessTokenPrincipal } from "@/lib/platform/principal/accessToken";
import { assertLocation, assertScope } from "@/lib/platform/principal/principalAuthorization";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";
import type { AuthorizationVerdict } from "@/lib/platform/principal/principalAuthorization";

export type ExternalRequestContext = {
    requestId: string;
    principal: ApplicationPrincipal;
    tokenId: string;
    /** Convenience mirrors of principal fields, all server-derived. */
    applicationId: string;
    installationId: string;
    organizationId: string;
    scopes: readonly string[];
    resourceBoundary: ApplicationPrincipal["boundary"];
};

export type ExternalAuthOutcome =
    | { ok: true; context: ExternalRequestContext }
    | { ok: false; refusal: string; auditReason: string; tokenId?: string; orgId?: string; installationId?: string };

/** Parse `Authorization: Bearer <token>`. Nothing else is accepted. */
export function bearerToken(headers: Headers): string | null {
    const raw = headers.get("authorization") ?? "";
    const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
    return match ? match[1] : null;
}

/**
 * Resolve the caller, or refuse.
 *
 * There is no parameter here for an organization, an installation, or a scope —
 * only the token. Everything else is read from trusted state, which is what makes
 * "caller input cannot change tenant authority" structural rather than a check
 * somebody remembered to write.
 */
export async function requireExternalPrincipal(
    supabase: SupabaseClient,
    headers: Headers,
    requestId: string,
    now: Date = new Date(),
): Promise<ExternalAuthOutcome> {
    const token = bearerToken(headers);
    if (!token) {
        return { ok: false, refusal: "invalid_credential", auditReason: "malformed_credential" };
    }

    const resolved = await resolveAccessTokenPrincipal(supabase, token, now);
    if (!resolved.ok) {
        return {
            ok: false,
            refusal: resolved.refusal,
            auditReason: resolved.auditReason,
            tokenId: resolved.tokenId,
            orgId: resolved.orgId,
            installationId: resolved.installationId,
        };
    }

    const p = resolved.principal;
    return {
        ok: true,
        context: {
            requestId,
            principal: p,
            tokenId: resolved.tokenId,
            applicationId: p.applicationId,
            installationId: p.installationId,
            organizationId: p.orgId,
            scopes: p.grantedScopes,
            resourceBoundary: p.boundary,
        },
    };
}

export function requireScope(context: ExternalRequestContext, scope: string): AuthorizationVerdict {
    return assertScope(context.principal, scope);
}

export function requireResource(context: ExternalRequestContext, locationId: string | null): AuthorizationVerdict {
    return assertLocation(context.principal, locationId);
}
