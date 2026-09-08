/**
 * WHICH MERCHANT COLLECTS — the server's answer, never the caller's.
 *
 * Childcare providers are merchants on their own Stripe connected accounts (Director decision), so
 * every collection has to answer "whose account does this money land in" before it answers anything
 * about amounts. That answer comes from `payment_provider_merchants` keyed by the session's org, and
 * from nowhere else: not from a request body, not from PaymentIntent metadata, not from a fallback.
 *
 * ── NO PLATFORM FALLBACK, AND WHY THAT IS A FEATURE ──
 *
 * When an organization has no usable connected account, collection REFUSES. Falling back to Alloy's
 * platform account would silently make Alloy the merchant of record for that family's money —
 * changing who is liable for a dispute and whose bank account settles, without anyone deciding it.
 * A refusal is recoverable; a silent merchant substitution is not.
 *
 * The legacy job/GHL Stripe path is unaffected: it collects on the platform account by design and
 * does not consult this module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentProcessor = "stripe";

export type MerchantReadiness =
    | "not_connected"
    | "onboarding_incomplete"
    | "restricted"
    | "ready";

export type CollectionMerchant = {
    merchantId: string;
    orgId: string;
    processor: PaymentProcessor;
    /** The external account id — `acct_…`. An identifier, never a secret. */
    providerAccountRef: string;
    readiness: MerchantReadiness;
    readinessCheckedAt: string | null;
};

/**
 * Why collection cannot proceed. A refusal names the state so an operator surface can say something
 * true ("finish Stripe onboarding") instead of "payment failed".
 */
export type MerchantRefusal = {
    ok: false;
    reason: "not_connected" | "onboarding_incomplete" | "restricted" | "withdrawn";
    message: string;
};

export type MerchantResolution = { ok: true; merchant: CollectionMerchant } | MerchantRefusal;

/**
 * The org's active merchant for a processor, or a refusal that says why.
 *
 * `orgId` MUST come from the authenticated session. It is the only tenancy input, and scoping the
 * query by it is what makes org B's account unreachable from org A's request — the substitution
 * attack this exists to refuse. There is no parameter through which a caller can name an account.
 */
export async function resolveCollectionMerchant(
    supabase: SupabaseClient,
    orgId: string,
    processor: PaymentProcessor = "stripe",
): Promise<MerchantResolution> {
    const { data, error } = await supabase
        .from("payment_provider_merchants")
        .select("id, org_id, processor, provider_account_ref, readiness, readiness_checked_at")
        .eq("org_id", orgId)
        .eq("processor", processor)
        .eq("is_active", true)
        .maybeSingle();

    if (error) throw new Error(`could not resolve the collecting merchant: ${error.message}`);

    if (!data) {
        return {
            ok: false,
            reason: "not_connected",
            message:
                "This organization has no connected Stripe account, so there is no merchant to collect into. "
                + "Connect one before taking card payments.",
        };
    }

    const row = data as unknown as {
        id: string;
        org_id: string;
        processor: PaymentProcessor;
        provider_account_ref: string;
        readiness: MerchantReadiness;
        readiness_checked_at: string | null;
    };

    // Compared against the literal rather than a `const` of the union type: a widened const defeats
    // narrowing, and TypeScript then cannot see that `ready` has been excluded from the refusal.
    if (row.readiness !== "ready") {
        return {
            ok: false,
            reason: row.readiness,
            message:
                row.readiness === "restricted"
                    ? "Stripe has restricted this merchant account, so it cannot accept charges."
                    : row.readiness === "onboarding_incomplete"
                        ? "This merchant has not finished Stripe onboarding, so it cannot accept charges yet."
                        : "This organization has no usable connected Stripe account to collect into.",
        };
    }

    return {
        ok: true,
        merchant: {
            merchantId: row.id,
            orgId: row.org_id,
            processor: row.processor,
            providerAccountRef: row.provider_account_ref,
            readiness: row.readiness,
            readinessCheckedAt: row.readiness_checked_at,
        },
    };
}

/**
 * Stripe's own answer, mapped onto the readiness vocabulary.
 *
 * Two Stripe booleans decide it, and both matter: `details_submitted` says the merchant finished
 * onboarding, `charges_enabled` says Stripe will actually accept a charge today. An account can have
 * submitted everything and still be restricted, which is why "onboarding complete" is not the same
 * question as "can collect".
 */
export function readinessFromStripeAccount(account: {
    charges_enabled?: boolean;
    details_submitted?: boolean;
}): MerchantReadiness {
    if (account.charges_enabled === true) return "ready";
    if (account.details_submitted === true) return "restricted";
    return "onboarding_incomplete";
}

/**
 * Assert that a connected account id belongs to this org before it is used.
 *
 * Used on any path that has an account reference in hand — a webhook, a callback — where the
 * reference arrived from outside and must be turned into tenancy rather than trusted as tenancy.
 * Returns the owning org, or null when the account is unknown or withdrawn, so an unknown account
 * fails CLOSED.
 */
export async function resolveOrgForConnectedAccount(
    supabase: SupabaseClient,
    providerAccountRef: string,
    processor: PaymentProcessor = "stripe",
): Promise<string | null> {
    const ref = providerAccountRef.trim();
    if (!ref) return null;
    const { data, error } = await supabase
        .from("payment_provider_merchants")
        .select("org_id")
        .eq("processor", processor)
        .eq("provider_account_ref", ref)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(`could not resolve the owning org for a connected account: ${error.message}`);
    return (data as { org_id?: string } | null)?.org_id ?? null;
}
