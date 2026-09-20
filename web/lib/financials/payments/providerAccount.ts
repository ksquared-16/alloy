/**
 * THE STRIPE ADAPTER FOR BECOMING A MERCHANT — and nothing else.
 *
 * W1 adds the one act the provider tier never had: an organisation can BECOME a merchant. Everything
 * downstream of that — collection, posting, refunds, returns — was built and certified in Threads
 * 8B/8C and is not touched here.
 *
 * ── THREE CALLS, TWO API VERSIONS, ON PURPOSE ──
 *
 *   create account   POST /v2/core/accounts        the approved account model lives in v2
 *   onboarding link  POST /v2/core/account_links   Stripe-hosted, single-use, expiring
 *   read account     GET  /v1/accounts/{id}        so readiness keeps ONE mapper
 *
 * The third is the interesting one. Stripe accepts a v2 account id at a v1 Accounts endpoint and
 * answers with a v1-shaped Account, which means `readinessFromStripeAccount` and
 * `achReadinessFromStripeAccount` — already certified against a real connected account — keep
 * working byte for byte. Reading the v2 shape instead would have meant a SECOND readiness mapper,
 * and two mappers that agree today are two mappers, the laxer of which eventually decides whether a
 * family can be charged.
 *
 * The certified collection path is likewise untouched: it still creates PaymentIntents on
 * `Stripe-Account: acct_…`, and a v2 account's id is an `acct_…`.
 *
 * ── WHAT THIS MODULE MUST NEVER LEAK ──
 *
 * No Stripe noun reaches the Payments domain from here. It returns an account id, a link URL, and a
 * v1-shaped account for the existing mapper. `configuration.merchant`, `controller`, capabilities,
 * requirement hashes and entity types stop at this file.
 *
 * ── AND IT NEVER TOUCHES KYC ──
 *
 * Stripe collects identity and verification information through its own hosted flow. Alloy asks for
 * an account and a link; it does not ask the provider for a tax id, a document, or a beneficial
 * owner, and it stores none of them.
 */

/** The API version this adapter is pinned to. One constant, so moving it is one edit and one test. */
export const STRIPE_V2_API_VERSION = "2026-08-26.preview";

export type StripeJsonCall = (
    method: "GET" | "POST",
    url: string,
    body: Record<string, unknown> | null,
    headers: Record<string, string>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/** Real Stripe unless a caller injects otherwise. The secret is read from the environment only. */
export const defaultStripeJsonCall: StripeJsonCall = async (method, url, body, headers) => {
    const secret = stripeSecret();
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${secret}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

function stripeSecret(): string {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured for this runtime");
    return secret;
}

/**
 * WHICH STRIPE WORLD THIS RUNTIME IS IN — derived from the key, never configured separately.
 *
 * A Connect webhook endpoint in production receives BOTH live and test deliveries, and the event
 * says which it is. The only trustworthy statement of what THIS runtime is doing is the key it
 * collects with: a `sk_test_` runtime cannot have created a live merchant, and a `sk_live_` runtime
 * cannot have created a test one. So the environment is read here rather than stored on the
 * merchant, and a delivery whose `livemode` disagrees is refused.
 *
 * This is also why no environment column is needed: a test account id and a live account id are
 * different objects with different ids, so the merchant binding already isolates the two worlds.
 * The livemode check exists to make a mismatch LOUD rather than merely improbable.
 */
export function runtimeExpectsLivemode(): boolean | null {
    // `null` means this runtime cannot say which world it is in. That is not a reason to guess —
    // the caller refuses, because a handler that cannot tell test from live must not move money
    // state in either.
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) return null;
    return secret.startsWith("sk_live_");
}

export type CreateProviderAccountInput = {
    /** The organisation's own name, shown to the provider and on the family's statement. */
    displayName: string;
    /** Where the provider contacts the merchant. Not stored by Alloy beyond this call. */
    contactEmail?: string | null;
    /** ISO-3166-1 alpha-2, lowercase. The account's acquiring country. */
    country?: string;
    /** Ask the provider for the bank rail as well as cards. */
    requestBankRail?: boolean;
};

export type CreateProviderAccountResult =
    | { ok: true; providerAccountRef: string }
    | { ok: false; reason: "provider_refused"; message: string };

/**
 * Create the connected account the approved architecture specifies.
 *
 * `dashboard: "full"` with Stripe collecting requirements and Stripe collecting fees and bearing
 * payment losses is the Standard-equivalent configuration: the childcare provider is the merchant
 * of record, keeps a real relationship with Stripe, and Alloy is liable for none of it. The dashboard
 * type is immutable once the account exists, which is why it is stated here rather than defaulted.
 */
export async function createProviderAccount(
    input: CreateProviderAccountInput,
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<CreateProviderAccountResult> {
    /*
     * THE RAIL HAS TWO PROVIDER NAMES, AND THIS IS THE ONLY PLACE THAT KNOWS IT.
     *
     * Accounts v2 calls the bank rail `ach_debit_payments`; the v1 Account shape this adapter reads
     * readiness from reports the same capability as `us_bank_account_ach_payments`. Measured against
     * the real provider: requesting the v1 name here is refused outright —
     * "configuration.merchant.capabilities.us_bank_account_ach_payments: Unknown field."
     *
     * So the REQUEST uses the v2 name and the READ keeps the v1 name, which is exactly the
     * translation an adapter exists to do. Alloy's own vocabulary — `ach_readiness` — is neither.
     */
    const capabilities: Record<string, unknown> = { card_payments: { requested: true } };
    if (input.requestBankRail !== false) {
        capabilities.ach_debit_payments = { requested: true };
    }

    const res = await call(
        "POST",
        "https://api.stripe.com/v2/core/accounts",
        {
            display_name: input.displayName,
            ...(input.contactEmail ? { contact_email: input.contactEmail } : {}),
            dashboard: "full",
            identity: { country: (input.country ?? "us").toLowerCase() },
            configuration: { merchant: { capabilities } },
            defaults: {
                currency: "usd",
                // Stripe collects its own fees from the merchant, and Stripe carries payment losses.
                // Alloy takes no application fee and accepts no negative-balance liability.
                responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
            },
            include: ["configuration.merchant", "requirements"],
        },
        { "Stripe-Version": STRIPE_V2_API_VERSION },
    );

    if (res.status < 200 || res.status >= 300) {
        return { ok: false, reason: "provider_refused", message: providerMessage(res.body) };
    }
    const id = typeof res.body.id === "string" ? res.body.id : "";
    if (!id) {
        return { ok: false, reason: "provider_refused", message: "the provider returned no account identifier" };
    }
    return { ok: true, providerAccountRef: id };
}

export type OnboardingLinkResult =
    | { ok: true; url: string }
    | { ok: false; reason: "provider_refused"; message: string };

/**
 * A single-use, expiring link into the provider's own onboarding flow.
 *
 * Never persisted. It grants access to the account holder's personal information, it expires within
 * minutes, and a link that has merely been PREVIEWED by a mail client is already spent — so the
 * operator asks for a new one rather than Alloy keeping the last one around.
 *
 * `eventually_due` is up-front collection: one trip through onboarding rather than a merchant who is
 * "ready" until the day a deadline passes and charging stops.
 */
export async function createOnboardingLink(
    input: { providerAccountRef: string; returnUrl: string; refreshUrl: string },
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<OnboardingLinkResult> {
    const res = await call(
        "POST",
        "https://api.stripe.com/v2/core/account_links",
        {
            account: input.providerAccountRef,
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    configurations: ["merchant"],
                    collection_options: { fields: "eventually_due" },
                    return_url: input.returnUrl,
                    refresh_url: input.refreshUrl,
                },
            },
        },
        { "Stripe-Version": STRIPE_V2_API_VERSION },
    );

    if (res.status < 200 || res.status >= 300) {
        return { ok: false, reason: "provider_refused", message: providerMessage(res.body) };
    }
    const url = typeof res.body.url === "string" ? res.body.url : "";
    if (!url) return { ok: false, reason: "provider_refused", message: "the provider returned no onboarding link" };
    return { ok: true, url };
}

/** The v1-shaped account the certified readiness mappers already read. See the header. */
export type ProviderAccountSnapshot = {
    charges_enabled?: boolean;
    details_submitted?: boolean;
    capabilities?: Record<string, string> | null;
    requirements?: Record<string, unknown> | null;
};

export type RetrieveProviderAccountResult =
    | { ok: true; account: ProviderAccountSnapshot }
    | { ok: false; reason: "not_found" | "provider_refused"; message: string };

/**
 * Read the account AS A V1 ACCOUNT, whichever API created it.
 *
 * This is the whole reason W1 needs no second readiness mapper: Stripe accepts a v2 account id here
 * and answers in the v1 shape, so `readinessFromStripeAccount` and `achReadinessFromStripeAccount`
 * — certified against a real connected account in Thread 8C — remain the only mapping in the system.
 */
export async function retrieveProviderAccount(
    providerAccountRef: string,
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<RetrieveProviderAccountResult> {
    const res = await call(
        "GET",
        `https://api.stripe.com/v1/accounts/${encodeURIComponent(providerAccountRef)}`,
        null,
        {},
    );
    if (res.status === 404) {
        return { ok: false, reason: "not_found", message: "the provider no longer knows this account" };
    }
    if (res.status < 200 || res.status >= 300) {
        return { ok: false, reason: "provider_refused", message: providerMessage(res.body) };
    }
    return { ok: true, account: res.body as ProviderAccountSnapshot };
}

/**
 * The provider's own sentence, when it refused.
 *
 * Kept because "payment failed" tells an operator nothing, and bounded because a provider error body
 * is not an operator surface.
 */
function providerMessage(body: Record<string, unknown>): string {
    const error = (body.error ?? {}) as { message?: unknown };
    const message = typeof error.message === "string" ? error.message : "";
    return message.slice(0, 300) || "the provider refused the request";
}
