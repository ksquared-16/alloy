/**
 * Turning a presented credential into a trusted, tenant-bound principal — or
 * into nothing.
 *
 * This is the ONLY external authentication path. There is deliberately no second
 * one: an alternate resolver is how a system ends up with two answers to "who is
 * calling", and Thread 3 found what that costs (`requireAdminOrOps` and
 * `getAdminContextCached` resolving the same principal through different
 * resolvers, recorded in-repo as M2-13).
 *
 * ── THE LOOKUP IS THE VERIFICATION ──
 *
 * The presented secret is hashed and used as an equality selector on a unique
 * index. Nothing in this process compares secret material byte by byte, so there
 * is no early exit to time. A caller learns that a row matched or that none did.
 *
 * ── THE ORGANIZATION IS READ FROM THE ROW ──
 *
 * There is no parameter here for an organization, and no branch that would
 * accept one. A caller cannot name the tenant it wants to be. This is the
 * invariant SEC-0c violated on the internal side, where a route passed a
 * body-supplied org_id into an engine that preferred it over the row's own.
 *
 * ── FAIL CLOSED, EVERY TIME ──
 *
 * Every failure path returns a refusal, never a weaker principal. A lookup that
 * ERRORS denies: an unidentified caller is not an unprivileged one, and
 * collapsing the two is how a broken query becomes an open door.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashCredentialSecret } from "@/lib/platform/principal/applicationCredential";
import type {
    ApplicationPrincipal,
    PrincipalResolution,
    ResourceBoundary,
} from "@/lib/platform/principal/platformPrincipalTypes";

type CredentialRow = {
    id: string;
    installation_id: string;
    client_id: string;
    status: string;
    expires_at: string | null;
    secret_hash: string;
    secret_hash_secondary: string | null;
    secondary_expires_at: string | null;
};

type InstallationRow = {
    id: string;
    application_id: string;
    org_id: string;
    granted_scopes: string[] | null;
    boundary_mode: string;
    location_boundary: string[] | null;
    producer_key: string;
    status: string;
};

type ApplicationRow = {
    id: string;
    slug: string;
    ownership_mode: string;
    environment: string;
    status: string;
};

export type PresentedCredential = { clientId: string; clientSecret: string };

/**
 * Resolve a presented credential.
 *
 * Three point lookups rather than one embedded join. Each step's filter is then
 * individually visible and individually testable, which matters more here than
 * saving two round trips: this is the function that decides tenancy, and a
 * reviewer should be able to see exactly what it selected on.
 */
export async function resolveApplicationPrincipal(
    supabase: SupabaseClient,
    presented: PresentedCredential,
    now: Date = new Date(),
): Promise<PrincipalResolution> {
    const clientId = (presented?.clientId ?? "").trim();
    const secret = (presented?.clientSecret ?? "").trim();

    // Malformed never reaches the database. An empty secret would otherwise be
    // hashed into a perfectly valid-looking digest and probe the index.
    if (!clientId || !secret) {
        return { ok: false, refusal: "invalid_credential", auditReason: "malformed_credential" };
    }

    const digest = hashCredentialSecret(secret);

    // Indexed equality against both secret slots. Never a scan, never a prefix
    // match, and never `like`.
    const { data: credRow, error: credErr } = await supabase
        .from("app_credentials")
        .select(
            "id, installation_id, client_id, status, expires_at, secret_hash, secret_hash_secondary, secondary_expires_at",
        )
        .or(`secret_hash.eq.${digest},secret_hash_secondary.eq.${digest}`)
        .maybeSingle();

    if (credErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed" };
    if (!credRow) return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential" };

    const credential = credRow as CredentialRow;

    // The client_id must belong to the row the SECRET found. Presenting one
    // application's client_id with another's secret resolves to neither.
    if (credential.client_id !== clientId) {
        return { ok: false, refusal: "invalid_credential", auditReason: "unknown_credential" };
    }

    if (credential.status !== "active") {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_revoked" };
    }

    if (credential.expires_at && new Date(credential.expires_at) <= now) {
        return { ok: false, refusal: "invalid_credential", auditReason: "credential_expired" };
    }

    // If the match was on the OUTGOING secret, the overlap deadline applies. A
    // lapsed overlap is exactly as dead as a revocation.
    const matchedSecondary =
        credential.secret_hash !== digest && credential.secret_hash_secondary === digest;
    if (matchedSecondary) {
        const until = credential.secondary_expires_at;
        if (!until || new Date(until) <= now) {
            return { ok: false, refusal: "invalid_credential", auditReason: "secondary_secret_expired" };
        }
    }

    const { data: instRow, error: instErr } = await supabase
        .from("app_installations")
        .select("id, application_id, org_id, granted_scopes, boundary_mode, location_boundary, producer_key, status")
        .eq("id", credential.installation_id)
        .maybeSingle();

    if (instErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed" };
    // A credential whose installation vanished authenticates to nothing.
    if (!instRow) {
        return {
            ok: false,
            refusal: "invalid_credential",
            auditReason: "unknown_credential",
            credentialId: credential.id,
        };
    }

    const installation = instRow as InstallationRow;

    // The secret has verified by this point, so naming the installation's state
    // tells the caller nothing they could not already confirm.
    if (installation.status === "suspended") {
        return {
            ok: false,
            refusal: "installation_suspended",
            auditReason: "installation_suspended",
            credentialId: credential.id,
            installationId: installation.id,
            orgId: installation.org_id,
        };
    }
    if (installation.status !== "active") {
        return {
            ok: false,
            refusal: "installation_revoked",
            auditReason: "installation_revoked",
            credentialId: credential.id,
            installationId: installation.id,
            orgId: installation.org_id,
        };
    }

    const { data: appRow, error: appErr } = await supabase
        .from("developer_applications")
        .select("id, slug, ownership_mode, environment, status")
        .eq("id", installation.application_id)
        .maybeSingle();

    if (appErr) return { ok: false, refusal: "lookup_failed", auditReason: "lookup_failed" };
    if (!appRow) {
        return {
            ok: false,
            refusal: "invalid_credential",
            auditReason: "unknown_credential",
            credentialId: credential.id,
            installationId: installation.id,
            orgId: installation.org_id,
        };
    }

    const application = appRow as ApplicationRow;
    if (application.status !== "active") {
        return {
            ok: false,
            refusal: "application_disabled",
            auditReason: "application_disabled",
            credentialId: credential.id,
            installationId: installation.id,
            orgId: installation.org_id,
        };
    }

    const boundary: ResourceBoundary =
        installation.boundary_mode === "org_wide"
            ? { mode: "org_wide" }
            : { mode: "locations", locationIds: Object.freeze([...(installation.location_boundary ?? [])]) };

    const principal: ApplicationPrincipal = Object.freeze({
        kind: "application",
        applicationId: application.id,
        applicationSlug: application.slug,
        ownershipMode: application.ownership_mode as ApplicationPrincipal["ownershipMode"],
        environment: application.environment as ApplicationPrincipal["environment"],
        installationId: installation.id,
        orgId: installation.org_id,
        producerKey: installation.producer_key,
        credentialId: credential.id,
        clientId: credential.client_id,
        grantedScopes: Object.freeze([...(installation.granted_scopes ?? [])]),
        boundary,
    });

    return { ok: true, principal };
}
