/**
 * BECOMING A MERCHANT — the product act the provider tier never had.
 *
 * Discovery found a complete, certified collection engine that no operator could reach, because
 * nothing in the product could write `payment_provider_merchants`. Every writer in the repository
 * was a test. This module is that missing writer, and it is deliberately the ONLY one.
 *
 * ── ONE READINESS WRITE AUTHORITY ──
 *
 * Connect, refresh and the `account.updated` webhook all converge on `persistReadiness` below, which
 * is the single place `readiness`, `ach_readiness`, `readiness_checked_at` and `readiness_detail`
 * are written. A route or component that wrote them itself would be a second answer to "can this
 * organisation take money", and the laxer of the two would eventually decide whether a family is
 * charged. The collection path keeps its own LIVE check against the provider before accepting money;
 * that reads, it does not write.
 *
 * ── AND ONE READINESS MAPPING ──
 *
 * `readinessFromStripeAccount` / `achReadinessFromStripeAccount`, unchanged and already certified.
 * The adapter reads the account in its v1 shape precisely so no second mapper is needed.
 *
 * ── WHAT THE ORGANISATION OWNS ──
 *
 * The childcare provider owns the Stripe relationship. Disconnecting in Alloy withdraws the
 * ASSOCIATION; it does not delete their account, their money, or their history. Historical payments
 * and attempts keep naming the account that actually collected them, which is why the merchant row
 * is withdrawn rather than repointed — a rule the database already enforces with a trigger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    achReadinessFromStripeAccount,
    readinessFromStripeAccount,
    type MerchantReadiness,
    type PaymentProcessor,
} from "./providerMerchant";
import {
    createOnboardingLink,
    createProviderAccount,
    defaultStripeJsonCall,
    retrieveProviderAccount,
    runtimeExpectsLivemode,
    type StripeJsonCall,
} from "./providerAccount";

const PROCESSOR: PaymentProcessor = "stripe";

/** The operator-facing state of an organisation's ability to take provider-backed payments. */
export type ProviderInstallationState = {
    connected: boolean;
    processor: PaymentProcessor | null;
    /** Alloy's own vocabulary, never the provider's. */
    readiness: MerchantReadiness | "not_connected";
    achReadiness: MerchantReadiness | null;
    cardAvailable: boolean;
    bankAvailable: boolean;
    readinessCheckedAt: string | null;
    /** Why something needs attention, in a sentence an operator can act on. */
    attention: string | null;
    /** Quiet diagnostic only. Never the product model. */
    providerAccountRef: string | null;
    merchantId: string | null;
};

type MerchantRow = {
    id: string;
    processor: PaymentProcessor;
    provider_account_ref: string;
    readiness: MerchantReadiness;
    ach_readiness: MerchantReadiness | null;
    readiness_checked_at: string | null;
};

const MERCHANT_COLUMNS = "id, processor, provider_account_ref, readiness, ach_readiness, readiness_checked_at";

export const NOT_CONNECTED: ProviderInstallationState = {
    connected: false,
    processor: null,
    readiness: "not_connected",
    achReadiness: null,
    cardAvailable: false,
    bankAvailable: false,
    readinessCheckedAt: null,
    attention: null,
    providerAccountRef: null,
    merchantId: null,
};

/**
 * WHAT AN OPERATOR IS TOLD, derived from the merchant and from nothing else.
 *
 * `cardAvailable` and `bankAvailable` restate the rail rule the account card already applies:
 * merchant-level readiness first, then the rail. A merchant that cannot charge at all offers no
 * rail, whatever its bank capability happens to say.
 */
export function describeInstallation(row: MerchantRow | null): ProviderInstallationState {
    if (!row) return NOT_CONNECTED;
    const ready = row.readiness === "ready";
    return {
        connected: true,
        processor: row.processor,
        readiness: row.readiness,
        achReadiness: row.ach_readiness,
        cardAvailable: ready,
        bankAvailable: ready && row.ach_readiness === "ready",
        readinessCheckedAt: row.readiness_checked_at,
        attention: attentionFor(row),
        providerAccountRef: row.provider_account_ref,
        merchantId: row.id,
    };
}

/** The sentence beside a state that is not `ready`. Operator language, never provider vocabulary. */
function attentionFor(row: MerchantRow): string | null {
    switch (row.readiness) {
        case "ready":
            return row.ach_readiness === "ready"
                ? null
                : "Card payments are ready. Bank payments are not enabled for this account yet — finish setup to add them.";
        case "onboarding_incomplete":
            return "Setup is not finished. Continue setup to start accepting payments.";
        case "restricted":
            return "The payment provider has restricted this account, so it cannot accept payments. Continue setup to resolve it.";
        case "not_connected":
            return "This account cannot accept payments yet. Continue setup to finish connecting it.";
        default:
            return "The provider reported a state Alloy does not recognise, so payments are unavailable.";
    }
}

/** The org's active merchant, or null. Org comes from the authenticated session, never a payload. */
export async function readActiveMerchant(
    supabase: SupabaseClient,
    orgId: string,
): Promise<MerchantRow | null> {
    const { data, error } = await supabase
        .from("payment_provider_merchants")
        .select(MERCHANT_COLUMNS)
        .eq("org_id", orgId)
        .eq("processor", PROCESSOR)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(`could not read the provider merchant: ${error.message}`);
    return (data as MerchantRow | null) ?? null;
}

export async function readInstallationState(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ProviderInstallationState> {
    return describeInstallation(await readActiveMerchant(supabase, orgId));
}

/**
 * THE ONE PLACE READINESS IS WRITTEN.
 *
 * Takes the provider's own answer, maps it once, and persists the cache with the moment it was
 * asked. `readiness_detail` keeps the bounded provider detail an operator surface may need to
 * explain itself — never KYC, never identity, never a document.
 */
async function persistReadiness(
    supabase: SupabaseClient,
    merchantId: string,
    account: { charges_enabled?: boolean; details_submitted?: boolean; capabilities?: Record<string, string> | null; requirements?: Record<string, unknown> | null },
    actorUserId: string | null,
): Promise<{ readiness: MerchantReadiness; achReadiness: MerchantReadiness }> {
    const readiness = readinessFromStripeAccount(account);
    const achReadiness = achReadinessFromStripeAccount(account);
    const requirements = (account.requirements ?? {}) as Record<string, unknown>;
    const { error } = await supabase
        .from("payment_provider_merchants")
        .update({
            readiness,
            ach_readiness: achReadiness,
            readiness_checked_at: new Date().toISOString(),
            readiness_detail: {
                disabled_reason: requirements.disabled_reason ?? null,
                currently_due: Array.isArray(requirements.currently_due) ? requirements.currently_due.length : null,
                past_due: Array.isArray(requirements.past_due) ? requirements.past_due.length : null,
            },
            updated_at: new Date().toISOString(),
            ...(actorUserId ? { updated_by: actorUserId } : {}),
        })
        .eq("id", merchantId);
    if (error) throw new Error(`could not record provider readiness: ${error.message}`);
    return { readiness, achReadiness };
}

export type ConnectOutcome =
    | { ok: true; state: ProviderInstallationState; onboardingUrl: string; created: boolean; resumed: boolean }
    | { ok: false; reason: "provider_refused" | "already_ready"; message: string; state: ProviderInstallationState };

/**
 * Connect, or resume connecting.
 *
 * IDEMPOTENT BY DESIGN, because the operator's second click must not mint a second merchant account
 * at the provider. Three states, three answers:
 *
 *   no active merchant        create the provider account, create the association, return a link
 *   an unfinished merchant    RESUME it — a new link for the SAME account, never a second account
 *   a ready merchant          refuse, and return the connected state. Nothing to do is an answer.
 *
 * The database backs this up: one active merchant per (org, processor) and one organisation per
 * account reference are unique indexes, so two concurrent clicks cannot both win.
 */
export async function connectProviderMerchant(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        actorUserId: string | null;
        displayName: string;
        contactEmail?: string | null;
        country?: string;
        returnUrl: string;
        refreshUrl: string;
    },
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<ConnectOutcome> {
    const existing = await readActiveMerchant(supabase, input.orgId);

    if (existing && existing.readiness === "ready") {
        return {
            ok: false,
            reason: "already_ready",
            message: "This organization is already connected and ready to accept payments.",
            state: describeInstallation(existing),
        };
    }

    if (existing) {
        // RESUME. Same account, new link. Creating another account here is the defect this branch
        // exists to prevent, and it would strand the first one at the provider forever.
        const link = await createOnboardingLink(
            { providerAccountRef: existing.provider_account_ref, returnUrl: input.returnUrl, refreshUrl: input.refreshUrl },
            call,
        );
        if (!link.ok) {
            return { ok: false, reason: "provider_refused", message: link.message, state: describeInstallation(existing) };
        }
        return { ok: true, state: describeInstallation(existing), onboardingUrl: link.url, created: false, resumed: true };
    }

    const account = await createProviderAccount(
        { displayName: input.displayName, contactEmail: input.contactEmail ?? null, country: input.country },
        call,
    );
    if (!account.ok) {
        return { ok: false, reason: "provider_refused", message: account.message, state: NOT_CONNECTED };
    }

    /*
     * TRUTHFUL INITIAL STATE. A brand-new account has submitted nothing and can charge nothing, so it
     * is `onboarding_incomplete` — not `ready`, and not `not_connected` either, because the
     * association now exists. The provider's own answer is read immediately rather than assumed.
     */
    const snapshot = await retrieveProviderAccount(account.providerAccountRef, call);
    const initialReadiness = snapshot.ok ? readinessFromStripeAccount(snapshot.account) : "onboarding_incomplete";
    const initialAch = snapshot.ok ? achReadinessFromStripeAccount(snapshot.account) : "onboarding_incomplete";

    const { data: inserted, error } = await supabase
        .from("payment_provider_merchants")
        .insert({
            org_id: input.orgId,
            processor: PROCESSOR,
            provider_account_ref: account.providerAccountRef,
            readiness: initialReadiness,
            ach_readiness: initialAch,
            readiness_checked_at: new Date().toISOString(),
            readiness_detail: {},
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select(MERCHANT_COLUMNS)
        .single();
    if (error) throw new Error(`could not record the provider merchant: ${error.message}`);

    const link = await createOnboardingLink(
        { providerAccountRef: account.providerAccountRef, returnUrl: input.returnUrl, refreshUrl: input.refreshUrl },
        call,
    );
    const row = inserted as MerchantRow;
    if (!link.ok) {
        // The association is real and recorded; only the link failed. The operator can ask again
        // through Continue setup, which resumes THIS merchant.
        return { ok: false, reason: "provider_refused", message: link.message, state: describeInstallation(row) };
    }
    return { ok: true, state: describeInstallation(row), onboardingUrl: link.url, created: true, resumed: false };
}

export type RefreshOutcome =
    | { ok: true; state: ProviderInstallationState }
    | { ok: false; reason: "not_connected" | "provider_refused" | "not_found"; message: string; state: ProviderInstallationState };

/**
 * Ask the provider what is true now, and persist it.
 *
 * This is both an operator action and the service every other convergence path calls — the return
 * from onboarding, and the webhook. Returning from onboarding is NOT proof of anything: the operator
 * may have clicked "Save for later". Only the provider's account state decides readiness.
 */
export async function refreshProviderReadiness(
    supabase: SupabaseClient,
    input: { orgId: string; actorUserId: string | null },
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<RefreshOutcome> {
    const merchant = await readActiveMerchant(supabase, input.orgId);
    if (!merchant) {
        return {
            ok: false,
            reason: "not_connected",
            message: "This organization has no connected payment provider.",
            state: NOT_CONNECTED,
        };
    }
    const snapshot = await retrieveProviderAccount(merchant.provider_account_ref, call);
    if (!snapshot.ok) {
        return {
            ok: false,
            reason: snapshot.reason === "not_found" ? "not_found" : "provider_refused",
            message: snapshot.message,
            state: describeInstallation(merchant),
        };
    }
    const persisted = await persistReadiness(supabase, merchant.id, snapshot.account, input.actorUserId);
    return {
        ok: true,
        state: describeInstallation({
            ...merchant,
            readiness: persisted.readiness,
            ach_readiness: persisted.achReadiness,
            readiness_checked_at: new Date().toISOString(),
        }),
    };
}

/**
 * Converge readiness from a signed provider event. The webhook owns admission; this owns the write.
 *
 * The merchant is resolved by the caller from the connected account reference — never from event
 * metadata — and the provider's account is re-read rather than trusted from the payload, so a
 * truncated or partial event body cannot set a merchant `ready`.
 */
export async function applyProviderAccountUpdate(
    supabase: SupabaseClient,
    input: { merchantId: string; providerAccountRef: string },
    call: StripeJsonCall = defaultStripeJsonCall,
): Promise<{ ok: true; readiness: MerchantReadiness; achReadiness: MerchantReadiness } | { ok: false; message: string }> {
    const snapshot = await retrieveProviderAccount(input.providerAccountRef, call);
    if (!snapshot.ok) return { ok: false, message: snapshot.message };
    const persisted = await persistReadiness(supabase, input.merchantId, snapshot.account, null);
    return { ok: true, ...persisted };
}

export type DisconnectOutcome =
    | { ok: true; state: ProviderInstallationState; withdrewMerchantId: string }
    | { ok: false; reason: "not_connected"; message: string; state: ProviderInstallationState };

/**
 * Withdraw the association from FUTURE collection. Nothing is deleted.
 *
 * Not deleted: the provider's Stripe account (it is theirs, not Alloy's), the merchant row, the
 * payments it collected, the attempts, the provider evidence, or the account reference on any
 * historical row. A withdrawn merchant keeps naming the account that actually collected, which is
 * what makes "who took this money in March" answerable in June.
 *
 * Reconnecting later creates a NEW active row — the account reference is immutable by trigger, so
 * withdraw-and-add is not merely the convention, it is the only thing the database permits.
 */
export async function disconnectProviderMerchant(
    supabase: SupabaseClient,
    input: { orgId: string; actorUserId: string | null },
): Promise<DisconnectOutcome> {
    const merchant = await readActiveMerchant(supabase, input.orgId);
    if (!merchant) {
        return {
            ok: false,
            reason: "not_connected",
            message: "This organization has no connected payment provider.",
            state: NOT_CONNECTED,
        };
    }
    const { error } = await supabase
        .from("payment_provider_merchants")
        .update({
            is_active: false,
            updated_at: new Date().toISOString(),
            ...(input.actorUserId ? { updated_by: input.actorUserId } : {}),
        })
        .eq("id", merchant.id);
    if (error) throw new Error(`could not withdraw the provider merchant: ${error.message}`);
    return { ok: true, state: NOT_CONNECTED, withdrewMerchantId: merchant.id };
}

/** Re-exported so callers need one import for the environment rule. */
export { runtimeExpectsLivemode };
