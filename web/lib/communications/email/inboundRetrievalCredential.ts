/**
 * WHOSE key fetches a received email's content.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO FIX
 * ---------------------------------------------------------------------------
 *
 * Retrieval read `process.env.RESEND_API_KEY` and nothing else. An organization that had
 * connected its OWN Resend account through the self-service flow — credential in Vault,
 * `secret_ref` of `vault:…` on its binding, account `active` and `verified` — still failed
 * with `missing_api_key`, because the one credential the tenant actually owns was never
 * consulted. The receiving client's own doc comment already described the intended rule
 * ("read by the caller from the binding's `secret_ref`, falling back to the environment");
 * the caller simply never implemented it.
 *
 * ---------------------------------------------------------------------------
 * ORDER, AND WHY IT IS NOT A FALLBACK CHAIN
 * ---------------------------------------------------------------------------
 *
 * The obvious shape — try the org key, else use the deployment key — is wrong, and
 * dangerously so. It would mean that REVOKING an organization's credential silently
 * promotes Alloy's own deployment key to act on that tenant's behalf: the connection the
 * administrator just disabled keeps working, under a credential they never granted.
 *
 * So an org-owned reference is TERMINAL. If the binding says `vault:…` and the authority
 * will not resolve it — revoked, disabled, wrong tenant, missing platform function — this
 * fails closed with `org_credential_unavailable`. It never reaches for the environment.
 *
 * The deployment key remains valid for exactly one case: a binding that names no org-owned
 * credential, i.e. an Alloy-owned or deployment-provisioned provider account. That is the
 * only situation in which `RESEND_API_KEY` is the intended authority, and it must never be
 * *required* for a tenant who brought their own.
 *
 * ---------------------------------------------------------------------------
 * ORDERING AGAINST OWNERSHIP
 * ---------------------------------------------------------------------------
 *
 * Nothing here can run before ownership. It takes an `orgId` and a `secretRef` that the
 * caller obtained from the BINDING that ownership resolved — `received_for` →
 * `communication_ingress_routes.destination` (globally unique on `lower(destination)`) →
 * binding, through a composite `(id, org_id)` foreign key that makes a cross-tenant route
 * unstorable. A forged `received_for` therefore matches no route, ownership fails, and this
 * function is never called: there is no path from an attacker-supplied string to a
 * credential lookup.
 *
 * The plaintext is returned to exactly one caller, which passes it straight to the provider
 * fetch. It is never logged, never returned to a client, and never written to an ingress
 * receipt or a canonical message.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isOrgOwnedSecretRef, resolveOrgProviderCredential } from "@/lib/communications/orgProviderCredential";

/** Where a resolved key came from. Recorded in diagnostics; the key itself never is. */
export type InboundRetrievalCredentialSource = "org_owned" | "deployment_env";

export type InboundRetrievalCredential =
    | { ok: true; apiKey: string; source: InboundRetrievalCredentialSource }
    /**
     * The binding names an org-owned credential that would not resolve. FAIL CLOSED —
     * this is a revoked, disabled or foreign credential, and substituting the deployment
     * key would resurrect a connection the organization turned off.
     */
    | { ok: false; reason: "org_credential_unavailable" }
    /** No org-owned reference and no deployment key. Nothing can fetch this message. */
    | { ok: false; reason: "no_credential_available" };

/** `env:NAME` references name a deployment-provisioned variable. Anything else does not. */
function envVarFromSecretRef(secretRef: string | null | undefined): string | null {
    const ref = String(secretRef ?? "").trim();
    if (!ref.toLowerCase().startsWith("env:")) return null;
    const name = ref.slice(4).trim();
    return name || null;
}

/**
 * Resolve the credential that may fetch this organization's received email.
 *
 * `orgId` and `secretRef` MUST both come from the binding ownership resolved — passing a
 * `secretRef` from one tenant with another's `orgId` is refused by the database authority,
 * not by this function, which is the right place for that rule to live.
 */
export async function resolveInboundRetrievalCredential(params: {
    supabase: SupabaseClient;
    orgId: string;
    secretRef: string | null | undefined;
    /**
     * Variable lookup. Deliberately a plain map rather than `NodeJS.ProcessEnv`: this
     * function reads exactly one name, and demanding the full process shape would force
     * every test to supply `NODE_ENV` to ask a question that has nothing to do with it.
     */
    env?: Record<string, string | undefined>;
}): Promise<InboundRetrievalCredential> {
    const env = params.env ?? process.env;

    if (isOrgOwnedSecretRef(params.secretRef)) {
        const apiKey = await resolveOrgProviderCredential(params.supabase, {
            orgId: params.orgId,
            secretRef: String(params.secretRef),
        });
        // Terminal either way. See the header: no fallback past an org-owned reference.
        if (!apiKey) return { ok: false, reason: "org_credential_unavailable" };
        return { ok: true, apiKey, source: "org_owned" };
    }

    // A binding may name a deployment variable explicitly (`env:RESEND_API_KEY`), or name
    // nothing at all — an older org-level binding predating self-service. Both mean the
    // deployment is the intended authority, so both read the environment.
    const named = envVarFromSecretRef(params.secretRef);
    const deploymentKey = (env[named ?? "RESEND_API_KEY"] ?? "").trim();
    if (deploymentKey) return { ok: true, apiKey: deploymentKey, source: "deployment_env" };

    return { ok: false, reason: "no_credential_available" };
}
