/**
 * What an external application IS to Alloy, once it has proven a credential.
 *
 * ── THE PRINCIPAL IS NOT A PERSON ──
 *
 * An ApplicationPrincipal carries no user id, no role, no person id and no
 * session, and it deliberately has nowhere to put one. That is not an oversight
 * to be corrected later: every human authorization path in Alloy reads a role or
 * a permission grant off an actor, and a principal that could supply either
 * would eventually satisfy a check written for an operator. The `kind`
 * discriminant exists so that a function expecting a human cannot be handed one
 * of these by accident, and so a reviewer can see the difference at the call site.
 *
 * ── EVERY FIELD IS SERVER-DERIVED ──
 *
 * Nothing here is read from a request. The organization comes from the
 * installation row, the scopes come from the installation row, the boundary comes
 * from the installation row, and the producer identity comes from the
 * installation row. There is no constructor that accepts a caller-supplied
 * organization, because the failure Thread 3 documented (SEC-0c: a route that
 * passed a body-supplied org_id into an engine which preferred it) is only
 * possible where such a constructor exists.
 */

/** Where an installation may act. Two shapes, so "none" can never read as "all". */
export type ResourceBoundary =
    | { readonly mode: "org_wide" }
    | { readonly mode: "locations"; readonly locationIds: readonly string[] };

/**
 * An authenticated external application, bound to exactly one organization.
 */
export type ApplicationPrincipal = {
    /** Discriminant. Never "user", never "operator" — see the header. */
    readonly kind: "application";

    readonly applicationId: string;
    readonly applicationSlug: string;
    readonly ownershipMode: "tenant_private" | "alloy_managed" | "partner_managed";
    readonly environment: "sandbox" | "production";

    readonly installationId: string;
    /** THE tenant. Read from the installation, never from the caller. */
    readonly orgId: string;
    /** Durable provenance identity, stable across credential rotation. */
    readonly producerKey: string;

    readonly credentialId: string;
    readonly clientId: string;

    readonly grantedScopes: readonly string[];
    readonly boundary: ResourceBoundary;
};

/**
 * Why a credential did not become a principal — as told to the CALLER.
 *
 * Deliberately coarse before the secret verifies. `invalid_credential` covers
 * malformed, unknown, revoked and expired alike, because distinguishing them
 * tells a prober whether a secret was ever real. Once the secret HAS verified the
 * caller has already proven possession, so naming the installation's state is
 * safe and is the more useful answer.
 */
export type PrincipalRefusal =
    | "invalid_credential"
    | "installation_suspended"
    | "installation_revoked"
    | "application_disabled"
    | "lookup_failed";

/**
 * Why it was refused, for the AUDIT — which may be specific, because it is read
 * by the tenant that owns the credential rather than by whoever presented it.
 */
export type PrincipalAuditReason =
    | "malformed_credential"
    | "unknown_credential"
    | "credential_revoked"
    | "credential_expired"
    | "secondary_secret_expired"
    | "installation_suspended"
    | "installation_revoked"
    | "application_disabled"
    | "lookup_failed";

export type PrincipalResolution =
    | { readonly ok: true; readonly principal: ApplicationPrincipal }
    | {
          readonly ok: false;
          /** Safe to return over the wire. */
          readonly refusal: PrincipalRefusal;
          /** Never returned over the wire; written to app_security_audit. */
          readonly auditReason: PrincipalAuditReason;
          /** Present only when the secret verified before the refusal. */
          readonly credentialId?: string;
          readonly installationId?: string;
          readonly orgId?: string;
      };
