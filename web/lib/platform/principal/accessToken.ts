/**
 * Short-lived bearer tokens, and the one path that turns one back into a
 * principal.
 *
 * ── THE TOKEN CARRIES NO AUTHORITY ──
 *
 * A token row records WHICH credential and WHICH installation minted it, and
 * nothing about what they may do. Scopes and boundary are re-read from the
 * installation on every verification.
 *
 * That is not a shortcut, it is the reason Thread 4 chose opaque tokens over
 * JWTs. A token that carries its own scopes is authority frozen at mint time,
 * and revoking one needs a denylist — which is a database lookup, which is what
 * an opaque token already is. Re-deriving makes all five revocation paths
 * immediate by construction rather than by a cache-invalidation call somebody
 * has to remember: Thread 3 found `invalidateAdminShellContextCache` has zero
 * production call sites and a 120-second TTL, and exporting that staleness to
 * partners would have been worse than keeping it internal.
 *
 * The cost is honest: verification is four indexed point lookups. That is what
 * immediate revocation costs, and it was priced in when the mechanism was chosen.
 */

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
    ApplicationPrincipal,
    PrincipalResolution,
    ResourceBoundary,
} from "@/lib/platform/principal/platformPrincipalTypes";

/** Recognisable prefix so a leaked token is greppable in a log or a commit. */
const TOKEN_PREFIX = "alloy_at_";
const TOKEN_BYTES = 32;

/** Fifteen minutes, as ratified in Thread 4 §02 D. */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function hashAccessToken(plaintext: string): string {
    return createHash("sha256").update(String(plaintext).trim(), "utf8").digest("hex");
}

export type IssuedAccessToken = {
    tokenId: string;
    /** The only time this value exists. */
    accessToken: string;
    expiresInSeconds: number;
    expiresAt: string;
};

export async function issueAccessToken(
    supabase: SupabaseClient,
    params: { credentialId: string; installationId: string; now?: Date },
): Promise<{ ok: true; issued: IssuedAccessToken } | { ok: false; reason: string }> {
    const now = params.now ?? new Date();
    const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();

    const { data, error } = await supabase
        .from("app_access_tokens")
        .insert({
            credential_id: params.credentialId,
            installation_id: params.installationId,
            token_hash: hashAccessToken(token),
            expires_at: expiresAt,
        })
        .select("id")
        .maybeSingle();

    if (error || !data) return { ok: false, reason: error?.message ?? "insert_failed" };

    return {
        ok: true,
        issued: {
            tokenId: (data as { id: string }).id,
            accessToken: token,
            expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
            expiresAt,
        },
    };
}

export type AccessTokenResolution =
    | { ok: true; principal: ApplicationPrincipal; tokenId: string }
    | (Extract<PrincipalResolution, { ok: false }> & { tokenId?: string });

/**
 * The ONE access-token verification path.
 *
 * Every future /api/v1 route consumes this. No route parses an Authorization
 * header of its own, resolves an organization of its own, or reads a scope of
 * its own — Thread 3 recorded what two resolvers for one principal costs
 * (`M2-13`: two gates in one request disagreeing about the same caller).
 */
export async function resolveAccessTokenPrincipal(
    supabase: SupabaseClient,
    presentedToken: string,
    now: Date = new Date(),
): Promise<AccessTokenResolution> {
    const token = (presentedToken ?? "").trim();
    if (!token) {
        return { ok: false, refusal: "invalid_credential", auditReason: "malformed_credential" };
    }

    const { data: tokenRow, error: tokenErr } = await supabase
        .from("app_access_tokens")
        .select("id, credential_id, installation_id, expires_at, revoked_at")
        .eq("token_hash", hashAccessToken(token))
        .maybeSingle();

    if (tokenErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed" };
    if (!tokenRow) return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential" };

    const t = tokenRow as {
        id: string;
        credential_id: string;
        installation_id: string;
        expires_at: string;
        revoked_at: string | null;
    };

    if (t.revoked_at) {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_revoked", tokenId: t.id };
    }
    if (new Date(t.expires_at) <= now) {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_expired", tokenId: t.id };
    }

    // Lineage. Revoking the credential kills its tokens without touching them,
    // which is why revocation needs no fan-out and cannot miss one.
    const { data: credRow, error: credErr } = await supabase
        .from("app_credentials")
        .select("id, client_id, status, expires_at")
        .eq("id", t.credential_id)
        .maybeSingle();

    if (credErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed", tokenId: t.id };
    if (!credRow) {
        return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential", tokenId: t.id };
    }
    const cred = credRow as { id: string; client_id: string; status: string; expires_at: string | null };
    if (cred.status !== "active") {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_revoked", tokenId: t.id };
    }
    if (cred.expires_at && new Date(cred.expires_at) <= now) {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_expired", tokenId: t.id };
    }

    const { data: instRow, error: instErr } = await supabase
        .from("app_installations")
        .select("id, application_id, org_id, granted_scopes, boundary_mode, location_boundary, producer_key, status")
        .eq("id", t.installation_id)
        .maybeSingle();

    if (instErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed", tokenId: t.id };
    if (!instRow) {
        return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential", tokenId: t.id };
    }

    const inst = instRow as {
        id: string;
        application_id: string;
        org_id: string;
        granted_scopes: string[] | null;
        boundary_mode: string;
        location_boundary: string[] | null;
        producer_key: string;
        status: string;
    };

    if (inst.status === "suspended") {
        return {
            ok: false, refusal: "installation_suspended", auditReason: "installation_suspended",
            tokenId: t.id, installationId: inst.id, orgId: inst.org_id,
        };
    }
    if (inst.status !== "active") {
        return {
            ok: false, refusal: "installation_revoked", auditReason: "installation_revoked",
            tokenId: t.id, installationId: inst.id, orgId: inst.org_id,
        };
    }

    const { data: appRow, error: appErr } = await supabase
        .from("developer_applications")
        .select("id, slug, ownership_mode, environment, status")
        .eq("id", inst.application_id)
        .maybeSingle();

    if (appErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed", tokenId: t.id };
    if (!appRow) {
        return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential", tokenId: t.id };
    }
    const app = appRow as { id: string; slug: string; ownership_mode: string; environment: string; status: string };
    if (app.status !== "active") {
        return {
            ok: false, refusal: "application_disabled", auditReason: "application_disabled",
            tokenId: t.id, installationId: inst.id, orgId: inst.org_id,
        };
    }

    const boundary: ResourceBoundary =
        inst.boundary_mode === "org_wide"
            ? { mode: "org_wide" }
            : { mode: "locations", locationIds: Object.freeze([...(inst.location_boundary ?? [])]) };

    const principal: ApplicationPrincipal = Object.freeze({
        kind: "application",
        applicationId: app.id,
        applicationSlug: app.slug,
        ownershipMode: app.ownership_mode as ApplicationPrincipal["ownershipMode"],
        environment: app.environment as ApplicationPrincipal["environment"],
        installationId: inst.id,
        orgId: inst.org_id,
        producerKey: inst.producer_key,
        credentialId: cred.id,
        clientId: cred.client_id,
        grantedScopes: Object.freeze([...(inst.granted_scopes ?? [])]),
        boundary,
    });

    return { ok: true, principal, tokenId: t.id };
}

/** Revoke a single token. Installation- and credential-level revocation need no
 *  fan-out here, because verification re-checks both. */
export async function revokeAccessToken(
    supabase: SupabaseClient,
    tokenId: string,
): Promise<{ ok: boolean }> {
    const { error } = await supabase
        .from("app_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", tokenId);
    return { ok: !error };
}
