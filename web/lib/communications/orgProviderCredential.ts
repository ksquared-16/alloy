/**
 * Organization-owned provider credentials, from the TypeScript side.
 *
 * This is a THIN CLIENT of `public.org_provider_credential_*`, not a second
 * implementation. The database function is the authority: it owns the tenancy
 * rule, the Vault access, and the audit trail. Reimplementing any of that here
 * would create exactly the drift this seam exists to prevent — the Python sender
 * and this module resolve the same reference by calling the same function.
 *
 * Nothing here ever returns a secret to a caller that could serialize it. The
 * resolve helper is server-only and its result is passed straight to a provider
 * adapter; the API layer deals in `hasCredential` booleans.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The grammar for an organization-owned credential. Opaque by construction. */
export const ORG_CREDENTIAL_PREFIX = "vault:";

/** True when a reference names an organization-owned credential. */
export function isOrgOwnedSecretRef(secretRef: string | null | undefined): boolean {
    return String(secretRef ?? "").trim().startsWith(ORG_CREDENTIAL_PREFIX);
}

/**
 * Store or rotate a credential for a provider account this organization owns.
 *
 * Returns the opaque reference. The plaintext is never returned, never logged,
 * and cannot be read back through any API — the only path from reference to
 * plaintext is `resolveOrgProviderCredential`, which is service-role only.
 */
export type CredentialWriteFailure =
    /** Nothing was submitted. */
    | "empty_credential"
    /**
     * The credential authority is not present or not callable in THIS database.
     * The operator cannot fix it and neither can retrying — the environment is
     * missing the platform migration, or the caller is not service-role.
     *
     * This exists because the first real use of this path failed with a single
     * generic message that could not distinguish "your key is bad" from "this
     * deployment cannot store keys at all". The second is not the operator's
     * fault and must not be reported as though it were.
     */
    | "storage_unavailable"
    /** The authority ran and refused — e.g. the account is not this org's. */
    | "authority_refused";

/**
 * Classify a failed write WITHOUT reading the provider message.
 *
 * The error message can quote the arguments, and the arguments include the
 * secret, so only the CODE is inspected. PostgREST answers a missing function
 * with PGRST202, and PostgreSQL answers a permission failure with 42501; both
 * mean the same thing to an operator — this environment cannot store credentials.
 */
function classifyWriteError(error: { code?: string | null } | null): CredentialWriteFailure {
    const code = String(error?.code ?? "").trim().toUpperCase();
    if (code === "PGRST202" || code === "PGRST203" || code === "42883" || code === "42501") {
        return "storage_unavailable";
    }
    return "authority_refused";
}

export async function putOrgProviderCredential(
    supabase: SupabaseClient,
    params: { orgId: string; providerAccountId: string; secret: string; actorUserId?: string | null },
): Promise<{ ok: true; secretRef: string } | { ok: false; reason: CredentialWriteFailure }> {
    const secret = params.secret.trim();
    if (!secret) return { ok: false, reason: "empty_credential" };

    const { data, error } = await supabase.rpc("org_provider_credential_put", {
        p_org_id: params.orgId,
        p_provider_account_id: params.providerAccountId,
        p_secret: secret,
        p_actor_user_id: params.actorUserId ?? null,
    });

    if (error) return { ok: false, reason: classifyWriteError(error as { code?: string | null }) };
    // A non-reference answer means the authority is not the one we expect.
    if (typeof data !== "string" || !isOrgOwnedSecretRef(data)) return { ok: false, reason: "storage_unavailable" };
    return { ok: true, secretRef: data };
}

/**
 * Resolve a reference to plaintext. SERVER ONLY, service-role only.
 *
 * Returns null for a reference this organization does not own — the authority
 * makes that decision, so a caller cannot widen it by passing a different org.
 */
export async function resolveOrgProviderCredential(
    supabase: SupabaseClient,
    params: { orgId: string; secretRef: string },
): Promise<string | null> {
    if (!isOrgOwnedSecretRef(params.secretRef)) return null;
    const { data, error } = await supabase.rpc("org_provider_credential_resolve", {
        p_org_id: params.orgId,
        p_secret_ref: params.secretRef,
    });
    if (error || typeof data !== "string") return null;
    const value = data.trim();
    return value || null;
}

/** Destroy a credential and disable its connection. */
export async function revokeOrgProviderCredential(
    supabase: SupabaseClient,
    params: { orgId: string; providerAccountId: string; actorUserId?: string | null },
): Promise<boolean> {
    const { data, error } = await supabase.rpc("org_provider_credential_revoke", {
        p_org_id: params.orgId,
        p_provider_account_id: params.providerAccountId,
        p_actor_user_id: params.actorUserId ?? null,
    });
    return !error && data === true;
}
