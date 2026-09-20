/**
 * THE STRIPE ADAPTER FOR A STORED PAYMENT METHOD — and nothing else.
 *
 * W1's adapter answers "can this organisation collect". This one answers "what instrument has this
 * payer stored, and how do we use it". They are deliberately separate files: one talks about
 * merchants on `/v2/core/accounts`, this one talks about customers and methods on v1, and merging
 * them would produce a single module in which a merchant bug and a card bug live next to each other.
 *
 * ── WHERE THE DURABLE HANDLE LIVES ──
 *
 *   platform Customer  →  platform PaymentMethod  →  canonical payment_methods row
 *                                  ↓ (per collection)
 *                         clone onto the connected merchant  →  consumed by the charge
 *
 * The clone is NOT stored. Stripe is explicit that a clone used for a charge is consumed, because
 * it is not attached to a customer — so the connected-account object is disposable by design and the
 * platform object is the thing that survives. This is exactly what lets an organisation replace its
 * merchant without every family re-entering a card.
 *
 * ── WHY `on_behalf_of` IS NEVER SET, AND THIS IS NOT AN OVERSIGHT ──
 *
 * Stripe: "If a mandate is authorized for a PaymentIntent or SetupIntent on_behalf_of a connected
 * account, you can't use that mandate with a different connected account."
 *
 * Setting it would pin a family's bank authorization to whichever merchant the organisation happened
 * to have that day, and the next merchant would need a fresh authorization from every payer. The
 * authorization is therefore taken by the PLATFORM, which is the only party constant across merchant
 * replacement — and Stripe duplicates that mandate onto each clone.
 *
 * The one documented reason to set it is a platform in a DIFFERENT country from its connected
 * accounts, where the platform's setup may not satisfy the connected account's SCA requirements.
 * Alloy's platform and its childcare providers are both US, and ACH is a US rail, so that reason
 * does not apply here. If Alloy ever onboards a non-US merchant, this is the decision to revisit.
 *
 * ── WHAT THIS MODULE MUST NEVER LEAK, AND NEVER RETURN ──
 *
 * No Stripe noun reaches the Payments domain from here: `SetupIntent`, `PaymentMethod`,
 * `us_bank_account`, `Financial Connections` and `mandate` all stop at this file.
 *
 * And it never returns a credential. Stripe's `us_bank_account` object contains `routing_number`,
 * and the mapper below reads `bank_name` and `last4` and nothing else — the routing number has
 * nowhere to go in Alloy and is never carried out of this module. There is no PAN and no CVC to
 * refuse: tokenisation means Alloy's server never sees them at all.
 */

/** The rail, in Alloy's words. Stripe's spelling is confined to `stripeMethodType`. */
export type MethodRail = "card" | "ach";

/** Exactly the two types Stripe permits cloning across connected accounts. */
export function stripeMethodType(rail: MethodRail): "card" | "us_bank_account" {
    return rail === "ach" ? "us_bank_account" : "card";
}

export type StripeFormCall = (
    method: "GET" | "POST",
    path: string,
    body: Record<string, string> | null,
    headers: Record<string, string>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/** Real Stripe unless a caller injects otherwise. The secret is read from the environment only. */
export const defaultStripeFormCall: StripeFormCall = async (method, path, body, headers) => {
    const secret = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured for this runtime");
    const query = method === "GET" && body ? `?${new URLSearchParams(body).toString()}` : "";
    const res = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
        method,
        headers: {
            Authorization: `Bearer ${secret}`,
            ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
            ...headers,
        },
        ...(method === "POST" ? { body: new URLSearchParams(body ?? {}).toString() } : {}),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/**
 * THE DISCLOSURE STRIPE REQUIRES, AND WHY IT IS A CONSTANT RATHER THAN UI COPY.
 *
 * Stripe: "When collecting a bank account that you intend to clone to connected accounts, you must
 * communicate to the customer that their authorization extends to connected accounts on your
 * platform. … Failure to communicate this message to your customers could result in customer
 * confusion and increase the risk of disputed payments."
 *
 * Alloy DOES intend to clone — that is the whole architecture — so this is not optional and it is
 * not marketing text. It lives here, beside the calls that create the authorization, so that the
 * sentence and the mechanism it describes cannot drift apart. The surface renders it verbatim above
 * the provider's own mandate terms; Stripe's confirmation email carries its standard wording.
 *
 * It says only what is true: the childcare provider is the merchant, the authorization is held by
 * Alloy on their behalf, and it covers the providers this family is enrolled with.
 */
export const ACH_AUTHORIZATION_DISCLOSURE =
    "By saving this bank account you authorize Alloy, on behalf of the childcare providers you are "
    + "enrolled with, to debit it for amounts you owe them, and your bank to accept those debits. "
    + "This authorization covers providers connected to Alloy now and any provider this family "
    + "enrolls with later, so you will not be asked to re-authorize if your provider changes how "
    + "they process payments. You may remove this bank account at any time.";

/**
 * The platform-side Customer that owns a payer's stored methods.
 *
 * An adapter object, not an Alloy Payer and not a canonical concept. Alloy needs one per payer so
 * that a second card lands beside the first rather than creating a second wallet; that reuse is
 * achieved by reading `provider_customer_ref` back off the payer's existing rows, which works
 * because canonical rows are never deleted. No `stripe_customers` table exists and none is needed.
 *
 * `email` enables Financial Connections' return-user optimisation and is what Stripe sends the
 * mandate confirmation to. It is the payer's own address, already held by Alloy.
 */
export async function createPlatformCustomer(
    call: StripeFormCall,
    args: { email?: string | null; name?: string | null; alloyPayerId: string },
): Promise<{ ok: true; customerRef: string } | { ok: false; message: string }> {
    const res = await call(
        "POST",
        "customers",
        {
            ...(args.email ? { email: args.email } : {}),
            ...(args.name ? { name: args.name } : {}),
            /* Correlation only. Tenancy is never resolved from provider metadata. */
            "metadata[alloy_payer_id]": args.alloyPayerId,
        },
        {},
    );
    if (res.status !== 200) return { ok: false, message: stripeMessage(res) };
    const id = String((res.body as { id?: string }).id ?? "");
    if (!id) return { ok: false, message: "the provider returned no customer id" };
    return { ok: true, customerRef: id };
}

/**
 * Open a provider-hosted setup so the payer can hand over an instrument WITHOUT Alloy seeing it.
 *
 * Returns a client secret, which is the browser's handle on the setup — not a credential Alloy owns
 * and not something persisted. Card and bank differ only in which type is offered: naming the type
 * explicitly stops the provider from quietly settling a bank setup as a card.
 *
 * Note the absence of `on_behalf_of`. See this module's header — it is the single parameter that
 * would break cross-merchant reuse.
 */
export async function createMethodSetup(
    call: StripeFormCall,
    args: { customerRef: string; rail: MethodRail },
): Promise<{ ok: true; setupRef: string; clientSecret: string } | { ok: false; message: string }> {
    const res = await call(
        "POST",
        "setup_intents",
        {
            customer: args.customerRef,
            "payment_method_types[]": stripeMethodType(args.rail),
            /*
             * `off_session` usage: the payer is present now, but the whole point of storing the
             * method is collecting later without them. Declaring it here is what makes the stored
             * method valid for an unattended charge rather than only for a present-payer retry.
             */
            usage: "off_session",
            ...(args.rail === "ach"
                ? {
                      /*
                       * Instant verification where the bank supports it, microdeposits where it does
                       * not. Alloy handles both because refusing microdeposits would refuse the
                       * families whose banks are not in Financial Connections — and `pending` is an
                       * honest canonical state, so there is nothing to hide.
                       */
                      "payment_method_options[us_bank_account][verification_method]": "automatic",
                      "payment_method_options[us_bank_account][financial_connections][permissions][]": "payment_method",
                  }
                : {}),
        },
        {},
    );
    if (res.status !== 200) return { ok: false, message: stripeMessage(res) };
    const body = res.body as { id?: string; client_secret?: string };
    const setupRef = String(body.id ?? "");
    const clientSecret = String(body.client_secret ?? "");
    if (!setupRef || !clientSecret) return { ok: false, message: "the provider returned an unusable setup" };
    return { ok: true, setupRef, clientSecret };
}

/** What the provider says a setup actually achieved. Read back on the server; never trusted from the browser. */
export type MethodSetupOutcome = {
    /** `succeeded` | `requires_action` | `requires_payment_method` | `processing` | … verbatim. */
    status: string;
    methodRef: string | null;
    mandateRef: string | null;
    /** `verify_with_microdeposits` when the payer must still confirm deposits. */
    nextActionType: string | null;
    failureMessage: string | null;
};

export async function retrieveMethodSetup(
    call: StripeFormCall,
    setupRef: string,
): Promise<{ ok: true; outcome: MethodSetupOutcome } | { ok: false; message: string }> {
    const res = await call("GET", `setup_intents/${encodeURIComponent(setupRef)}`, null, {});
    if (res.status !== 200) return { ok: false, message: stripeMessage(res) };
    const body = res.body as {
        status?: string;
        payment_method?: string | { id?: string } | null;
        mandate?: string | { id?: string } | null;
        next_action?: { type?: string } | null;
        last_setup_error?: { message?: string } | null;
    };
    return {
        ok: true,
        outcome: {
            status: String(body.status ?? ""),
            methodRef: refOf(body.payment_method),
            mandateRef: refOf(body.mandate),
            nextActionType: body.next_action?.type ? String(body.next_action.type) : null,
            failureMessage: body.last_setup_error?.message ? String(body.last_setup_error.message) : null,
        },
    };
}

/** Safe display facts about a stored instrument. Never a credential — see the module header. */
export type MethodDisplay = {
    rail: MethodRail;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
};

export async function retrievePaymentMethod(
    call: StripeFormCall,
    methodRef: string,
    connectedAccountRef?: string | null,
): Promise<{ ok: true; display: MethodDisplay } | { ok: false; message: string }> {
    const res = await call(
        "GET",
        `payment_methods/${encodeURIComponent(methodRef)}`,
        null,
        connectedAccountRef ? { "Stripe-Account": connectedAccountRef } : {},
    );
    if (res.status !== 200) return { ok: false, message: stripeMessage(res) };
    return { ok: true, display: displayFromStripeMethod(res.body) };
}

/**
 * The provider's method object, reduced to what an operator may see.
 *
 * FOUR fields leave this function. `us_bank_account.routing_number` is present in Stripe's response
 * and is deliberately not among them: Alloy has no column for it, no use for it, and reading it into
 * a variable that later gets logged is exactly how credentials escape.
 */
export function displayFromStripeMethod(pm: Record<string, unknown>): MethodDisplay {
    const type = String((pm as { type?: string }).type ?? "");
    if (type === "us_bank_account") {
        const bank = ((pm as { us_bank_account?: Record<string, unknown> }).us_bank_account ?? {}) as {
            bank_name?: string;
            last4?: string;
        };
        return {
            rail: "ach",
            brand: bank.bank_name ? String(bank.bank_name) : null,
            last4: bank.last4 ? String(bank.last4) : null,
            expMonth: null,
            expYear: null,
        };
    }
    const card = ((pm as { card?: Record<string, unknown> }).card ?? {}) as {
        brand?: string;
        last4?: string;
        exp_month?: number;
        exp_year?: number;
    };
    return {
        rail: "card",
        brand: card.brand ? String(card.brand) : null,
        last4: card.last4 ? String(card.last4) : null,
        expMonth: Number.isFinite(card.exp_month) ? Number(card.exp_month) : null,
        expYear: Number.isFinite(card.exp_year) ? Number(card.exp_year) : null,
    };
}

/**
 * Clone the platform method onto the merchant that is about to charge.
 *
 * One call, immediately before the PaymentIntent, and never persisted. For a bank account Stripe
 * duplicates the mandate onto the clone — which is the mechanism the whole platform-handle design
 * rests on, and the reason the authorization must not have been taken `on_behalf_of` anyone.
 */
export async function cloneMethodToMerchant(
    call: StripeFormCall,
    args: { customerRef: string; methodRef: string; connectedAccountRef: string },
): Promise<{ ok: true; clonedMethodRef: string } | { ok: false; message: string }> {
    const res = await call(
        "POST",
        "payment_methods",
        { customer: args.customerRef, payment_method: args.methodRef },
        { "Stripe-Account": args.connectedAccountRef },
    );
    if (res.status !== 200) return { ok: false, message: stripeMessage(res) };
    const id = String((res.body as { id?: string }).id ?? "");
    if (!id) return { ok: false, message: "the provider returned no cloned method id" };
    return { ok: true, clonedMethodRef: id };
}

/**
 * Best-effort provider-side cleanup when an operator removes a method.
 *
 * Returns whether it worked, and the caller does NOT fail on false. Alloy's record of what happened
 * is canonical; a provider object we could not detach is untidiness, not a reason to leave the
 * operator's instruction unexecuted or to erase Alloy's history.
 */
export async function detachPaymentMethod(
    call: StripeFormCall,
    methodRef: string,
): Promise<{ detached: boolean; message: string | null }> {
    try {
        const res = await call("POST", `payment_methods/${encodeURIComponent(methodRef)}/detach`, {}, {});
        if (res.status === 200) return { detached: true, message: null };
        return { detached: false, message: stripeMessage(res) };
    } catch (e) {
        return { detached: false, message: e instanceof Error ? e.message : "provider detach failed" };
    }
}

function refOf(v: string | { id?: string } | null | undefined): string | null {
    if (!v) return null;
    if (typeof v === "string") return v || null;
    return v.id ? String(v.id) : null;
}

function stripeMessage(res: { status: number; body: Record<string, unknown> }): string {
    const err = (res.body?.error ?? {}) as { message?: string };
    return err.message ? String(err.message) : `the provider refused the request (${res.status})`;
}
