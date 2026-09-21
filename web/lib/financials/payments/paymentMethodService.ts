import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ACH_AUTHORIZATION_DISCLOSURE,
    cloneMethodToMerchant,
    createMethodSetup,
    createPlatformCustomer,
    defaultStripeFormCall,
    detachPaymentMethod,
    displayFromStripeMethod,
    retrieveMethodSetup,
    retrievePaymentMethod,
    type MethodRail,
    type StripeFormCall,
} from "./providerPaymentMethod";

import { failArrangementsForMethod } from "@/lib/financials/payments/autopayArrangement";

/**
 * THE CANONICAL PAYMENT METHOD REFERENCE — the one authority that writes `payment_methods`.
 *
 * W1 made an organisation able to collect. W2 makes a PAYER able to be collected from, and this
 * module is the only thing in the product that may create, change or withdraw a stored method.
 *
 * ── ONE WRITE AUTHORITY, FOR THE SAME REASON W1 HAS ONE ──
 *
 * Four paths change a stored method — the operator adds one, the operator sets a default, the
 * operator removes one, and the provider tells us something changed. All four converge here. A route
 * or component that wrote the table itself would be a second answer to "may we charge this card",
 * and the laxer of the two would eventually decide.
 *
 * ── WHAT IS PERSISTED, AND WHEN ──
 *
 * NOT when setup begins. Opening a provider session proves only that somebody clicked "Add payment
 * method"; the instrument may never be entered, may be abandoned at the bank's login screen, or may
 * be refused. A row created then would be a method on file that does not exist.
 *
 * A row is written when the PROVIDER, read back on the server, says an instrument exists — and it is
 * written in the state the provider actually reports. A bank account awaiting microdeposits is
 * `verification_state = pending` and `usability_state = blocked`, which is neither a lie nor a
 * failure: it exists, it is real, and it cannot be charged yet.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ──
 *
 * It never accepts an org from a caller's payload; `orgId` arrives from the authenticated session
 * and is applied to every read and every write. It never accepts a provider method reference from a
 * browser — the reference is read back from the setup the server itself created. And it never
 * deletes a canonical row: an operator's "Remove" is a revocation, because a payment that named this
 * method must keep naming it.
 */

export type PaymentMethodRecord = {
    id: string;
    orgId: string;
    payerEntityType: string;
    payerEntityId: string;
    customerId: string | null;
    rail: MethodRail;
    processor: string;
    providerCustomerRef: string;
    providerMethodRef: string;
    mandateRef: string | null;
    mandateAcceptedAt: string | null;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    verificationState: "unverified" | "pending" | "verified" | "failed";
    usabilityState: "usable" | "blocked" | "expired" | "revoked";
    isDefault: boolean;
    createdAt: string | null;
    verifiedAt: string | null;
    revokedAt: string | null;
    revokedReason: string | null;
    replacedById: string | null;
};

const COLUMNS =
    "id, org_id, payer_entity_type, payer_entity_id, customer_id, rail, processor, "
    + "provider_customer_ref, provider_method_ref, mandate_ref, mandate_accepted_at, "
    + "display_brand, display_last4, display_exp_month, display_exp_year, "
    + "verification_state, usability_state, is_default, created_at, verified_at, "
    + "revoked_at, revoked_reason, replaced_by_id";

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

function toRecord(row: Record<string, unknown>): PaymentMethodRecord {
    return {
        id: t(row.id),
        orgId: t(row.org_id),
        payerEntityType: t(row.payer_entity_type),
        payerEntityId: t(row.payer_entity_id),
        customerId: t(row.customer_id) || null,
        rail: (t(row.rail) === "ach" ? "ach" : "card") as MethodRail,
        processor: t(row.processor),
        providerCustomerRef: t(row.provider_customer_ref),
        providerMethodRef: t(row.provider_method_ref),
        mandateRef: t(row.mandate_ref) || null,
        mandateAcceptedAt: t(row.mandate_accepted_at) || null,
        brand: t(row.display_brand) || null,
        last4: t(row.display_last4) || null,
        expMonth: row.display_exp_month != null ? Number(row.display_exp_month) : null,
        expYear: row.display_exp_year != null ? Number(row.display_exp_year) : null,
        verificationState: (t(row.verification_state) || "unverified") as PaymentMethodRecord["verificationState"],
        usabilityState: (t(row.usability_state) || "usable") as PaymentMethodRecord["usabilityState"],
        isDefault: row.is_default === true,
        createdAt: t(row.created_at) || null,
        verifiedAt: t(row.verified_at) || null,
        revokedAt: t(row.revoked_at) || null,
        revokedReason: t(row.revoked_reason) || null,
        replacedById: t(row.replaced_by_id) || null,
    };
}

/**
 * Every method this account may see, newest first, revoked ones included.
 *
 * Revoked rows are returned deliberately: an operator who removed a card and is looking at the
 * screen a second later should see what they did, and a surface that silently drops them cannot
 * distinguish "removed" from "never existed".
 */
export async function readAccountMethods(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string },
): Promise<PaymentMethodRecord[]> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    if (!orgId || !customerId) return [];

    const { data, error } = await supabase
        .from("payment_methods")
        .select(COLUMNS)
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

    if (error) return [];
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toRecord);
}

/** One method, scoped by org. A method belonging to another tenant reads as absent, not as forbidden. */
export async function readMethod(
    supabase: SupabaseClient,
    args: { orgId: string; methodId: string },
): Promise<PaymentMethodRecord | null> {
    const orgId = t(args.orgId);
    const methodId = t(args.methodId);
    if (!orgId || !methodId) return null;

    const { data, error } = await supabase
        .from("payment_methods")
        .select(COLUMNS)
        .eq("org_id", orgId)
        .eq("id", methodId)
        .maybeSingle();

    if (error || !data) return null;
    return toRecord(data as unknown as Record<string, unknown>);
}

/**
 * The payer's existing platform-side customer, if Alloy has ever made one for them.
 *
 * This is the whole of the "provider customer" model: one column, read back. Revoked rows count —
 * they are never deleted, so a payer who removed their only card still has their wallet, and adding
 * a new card lands in it rather than creating a second one.
 */
async function existingCustomerRef(
    supabase: SupabaseClient,
    args: { orgId: string; payerEntityType: string; payerEntityId: string; processor: string },
): Promise<string | null> {
    const { data, error } = await supabase
        .from("payment_methods")
        .select("provider_customer_ref")
        .eq("org_id", args.orgId)
        .eq("processor", args.processor)
        .eq("payer_entity_type", args.payerEntityType)
        .eq("payer_entity_id", args.payerEntityId)
        .not("provider_customer_ref", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return t((data as { provider_customer_ref?: unknown }).provider_customer_ref) || null;
}

export type BeginAddOutcome =
    | {
          ok: true;
          setupRef: string;
          clientSecret: string;
          providerCustomerRef: string;
          rail: MethodRail;
          /** Rendered verbatim above the provider's mandate terms. Null for a card. */
          authorizationDisclosure: string | null;
      }
    | { ok: false; reason: "invalid_input" | "provider_error"; message: string };

/**
 * Open the provider-hosted collection. Creates NOTHING canonical.
 *
 * The platform customer is reused when the payer already has one and created when they do not —
 * which is the only duplicate-prevention this design needs, and needs no table of its own.
 */
export async function beginAddPaymentMethod(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerId: string | null;
        payerEntityType: string;
        payerEntityId: string;
        rail: MethodRail;
        payerEmail?: string | null;
        payerName?: string | null;
    },
    call: StripeFormCall = defaultStripeFormCall,
): Promise<BeginAddOutcome> {
    const orgId = t(args.orgId);
    const payerEntityId = t(args.payerEntityId);
    const payerEntityType = t(args.payerEntityType) || "person";
    if (!orgId || !payerEntityId) {
        return { ok: false, reason: "invalid_input", message: "A payer and an organization are required." };
    }
    if (args.rail !== "card" && args.rail !== "ach") {
        return { ok: false, reason: "invalid_input", message: "A payment method is a card or a bank account." };
    }

    let customerRef = await existingCustomerRef(supabase, {
        orgId,
        payerEntityType,
        payerEntityId,
        processor: "stripe",
    });

    if (!customerRef) {
        const created = await createPlatformCustomer(call, {
            email: args.payerEmail ?? null,
            name: args.payerName ?? null,
            alloyPayerId: payerEntityId,
        });
        if (!created.ok) return { ok: false, reason: "provider_error", message: created.message };
        customerRef = created.customerRef;
    }

    const setup = await createMethodSetup(call, { customerRef, rail: args.rail });
    if (!setup.ok) return { ok: false, reason: "provider_error", message: setup.message };

    return {
        ok: true,
        setupRef: setup.setupRef,
        clientSecret: setup.clientSecret,
        providerCustomerRef: customerRef,
        rail: args.rail,
        authorizationDisclosure: args.rail === "ach" ? ACH_AUTHORIZATION_DISCLOSURE : null,
    };
}

/**
 * Stripe's setup status, mapped onto the two canonical lifecycles.
 *
 * `succeeded` is the only status that yields a usable method. Everything else is honest about why
 * not — and `requires_action` with microdeposits is the case that matters most, because it is a real
 * instrument that simply cannot be charged for a day or two. Calling that `usable` would let an
 * operator schedule a collection the provider will refuse.
 */
export function lifecycleFromSetup(status: string, nextActionType: string | null): {
    verification: PaymentMethodRecord["verificationState"];
    usability: PaymentMethodRecord["usabilityState"];
} {
    switch (status) {
        case "succeeded":
            return { verification: "verified", usability: "usable" };
        case "requires_action":
            return {
                verification: nextActionType === "verify_with_microdeposits" ? "pending" : "unverified",
                usability: "blocked",
            };
        case "processing":
            return { verification: "pending", usability: "blocked" };
        case "requires_payment_method":
        case "canceled":
            return { verification: "failed", usability: "blocked" };
        default:
            /* An unrecognised provider status is never quietly usable. */
            return { verification: "unverified", usability: "blocked" };
    }
}

export type CompleteAddOutcome =
    | { ok: true; method: PaymentMethodRecord; created: boolean }
    | {
          ok: false;
          reason: "no_instrument" | "provider_error" | "already_claimed" | "invalid_input" | "write_failed";
          message: string;
      };

/**
 * Persist the canonical method, from provider evidence read back on the SERVER.
 *
 * The browser hands over a setup reference and nothing else. Every fact written here — which
 * instrument, which customer, what brand, what state — is read from the provider using Alloy's own
 * key, so a tampered payload can at most name a setup that does not belong to it, and that setup's
 * customer will not match the payer's.
 */
export async function completeAddPaymentMethod(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerId: string | null;
        payerEntityType: string;
        payerEntityId: string;
        rail: MethodRail;
        setupRef: string;
        providerCustomerRef: string;
        actorUserId?: string | null;
        makeDefault?: boolean;
    },
    call: StripeFormCall = defaultStripeFormCall,
): Promise<CompleteAddOutcome> {
    const orgId = t(args.orgId);
    const setupRef = t(args.setupRef);
    const payerEntityId = t(args.payerEntityId);
    if (!orgId || !setupRef || !payerEntityId) {
        return { ok: false, reason: "invalid_input", message: "A setup reference and a payer are required." };
    }

    const read = await retrieveMethodSetup(call, setupRef);
    if (!read.ok) return { ok: false, reason: "provider_error", message: read.message };
    const outcome = read.outcome;

    if (!outcome.methodRef) {
        /*
         * No instrument was ever attached — the payer closed the window, or the bank refused. There
         * is nothing truthful to store, so nothing is stored.
         */
        return {
            ok: false,
            reason: "no_instrument",
            message:
                outcome.failureMessage
                ?? "No payment method was completed. Nothing has been saved, and it can be tried again.",
        };
    }

    const pm = await retrievePaymentMethod(call, outcome.methodRef);
    if (!pm.ok) return { ok: false, reason: "provider_error", message: pm.message };
    const display = pm.display;
    const lifecycle = lifecycleFromSetup(outcome.status, outcome.nextActionType);
    const now = new Date().toISOString();

    const insert: Record<string, unknown> = {
        org_id: orgId,
        payer_entity_type: t(args.payerEntityType) || "person",
        payer_entity_id: payerEntityId,
        customer_id: t(args.customerId) || null,
        /* The PROVIDER's answer decides the rail, not the caller's request. */
        rail: display.rail,
        processor: "stripe",
        provider_customer_ref: t(args.providerCustomerRef),
        provider_method_ref: outcome.methodRef,
        mandate_ref: outcome.mandateRef,
        mandate_accepted_at: outcome.mandateRef ? now : null,
        display_brand: display.brand,
        display_last4: display.last4,
        display_exp_month: display.expMonth,
        display_exp_year: display.expYear,
        verification_state: lifecycle.verification,
        usability_state: lifecycle.usability,
        is_default: false,
        created_by: args.actorUserId ?? null,
        verified_at: lifecycle.verification === "verified" ? now : null,
    };

    const { data, error } = await supabase.from("payment_methods").insert(insert).select(COLUMNS).maybeSingle();

    if (error) {
        /*
         * The provider-reference unique index is the cross-tenant guard: one platform method belongs
         * to one Alloy method, so a second claim is refused by the database rather than by a check
         * that two concurrent requests would both pass.
         */
        if (/uq_payment_methods_provider_method_ref|duplicate key/i.test(error.message)) {
            return {
                ok: false,
                reason: "already_claimed",
                message: "This payment method is already on file.",
            };
        }
        return { ok: false, reason: "write_failed", message: error.message };
    }
    if (!data) return { ok: false, reason: "write_failed", message: "the method could not be saved" };

    let method = toRecord(data as unknown as Record<string, unknown>);

    /* Only a usable method may become the default, and the database says so too. */
    if (args.makeDefault && method.usabilityState === "usable" && method.customerId) {
        const def = await setDefaultPaymentMethod(supabase, {
            orgId,
            methodId: method.id,
            actorUserId: args.actorUserId ?? null,
        });
        if (def.ok) method = def.method;
    }

    return { ok: true, method, created: true };
}

export type SetDefaultOutcome =
    | { ok: true; method: PaymentMethodRecord }
    | { ok: false; reason: "not_found" | "not_usable" | "no_scope" | "write_failed"; message: string };

/**
 * Move the default within one account and rail, atomically, in the database.
 *
 * The clear-then-set pair is a single transaction inside `set_default_payment_method` precisely
 * because doing it from here would leave a window with no default at all.
 */
export async function setDefaultPaymentMethod(
    supabase: SupabaseClient,
    args: { orgId: string; methodId: string; actorUserId?: string | null },
): Promise<SetDefaultOutcome> {
    const orgId = t(args.orgId);
    const methodId = t(args.methodId);
    if (!orgId || !methodId) return { ok: false, reason: "not_found", message: "No payment method was named." };

    const { data, error } = await supabase.rpc("set_default_payment_method", {
        p_method_id: methodId,
        p_org_id: orgId,
        p_actor: args.actorUserId ?? null,
    });

    if (error) {
        if (/no_data_found|is not in organization/i.test(error.message)) {
            return { ok: false, reason: "not_found", message: "That payment method is not on this account." };
        }
        if (/no account scope/i.test(error.message)) {
            return {
                ok: false,
                reason: "no_scope",
                message: "That payment method is not attached to an account, so it cannot be a default.",
            };
        }
        if (/cannot be made the default/i.test(error.message)) {
            return {
                ok: false,
                reason: "not_usable",
                message: "That payment method cannot be used, so it cannot be the default.",
            };
        }
        return { ok: false, reason: "write_failed", message: error.message };
    }

    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
    if (!row) return { ok: false, reason: "write_failed", message: "the default could not be set" };
    return { ok: true, method: toRecord(row) };
}

export type RevokeOutcome =
    | { ok: true; method: PaymentMethodRecord; providerDetached: boolean }
    | { ok: false; reason: "not_found" | "already_revoked" | "write_failed"; message: string };

/**
 * An operator's "Remove", which is a revocation and never a delete.
 *
 * Deleting the row would take the reference out from under every payment that named this method.
 * The canonical row stays, carrying why and when it was withdrawn; the default flag goes, and
 * NOTHING is promoted in its place. An account whose default was removed has no default for that
 * rail until someone chooses one — silently promoting the next card would mean a family's money
 * moves from an instrument they never selected.
 */
export async function revokePaymentMethod(
    supabase: SupabaseClient,
    args: { orgId: string; methodId: string; reason?: string | null; actorUserId?: string | null },
    call: StripeFormCall = defaultStripeFormCall,
): Promise<RevokeOutcome> {
    const existing = await readMethod(supabase, { orgId: args.orgId, methodId: args.methodId });
    if (!existing) return { ok: false, reason: "not_found", message: "That payment method is not on this account." };
    if (existing.usabilityState === "revoked") {
        return { ok: false, reason: "already_revoked", message: "That payment method has already been removed." };
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("payment_methods")
        .update({
            usability_state: "revoked",
            is_default: false,
            revoked_at: now,
            revoked_reason: t(args.reason) || "removed by operator",
            updated_at: now,
            updated_by: args.actorUserId ?? null,
        })
        .eq("org_id", t(args.orgId))
        .eq("id", t(args.methodId))
        .select(COLUMNS)
        .maybeSingle();

    if (error) return { ok: false, reason: "write_failed", message: error.message };
    if (!data) return { ok: false, reason: "write_failed", message: "the method could not be removed" };

    /*
     * Provider cleanup is attempted AFTER Alloy's own record is truthful, and its failure is
     * reported rather than raised. A detach that fails leaves an orphaned object at Stripe; a revoke
     * that fails because of it would leave an operator's instruction unexecuted.
     */
    const detach = await detachPaymentMethod(call, existing.providerMethodRef);

    /*
     * AUTOPAY CONVERGENCE (W5). A standing authorization names ONE instrument, so removing it ends
     * the arrangement's ability to execute. Leaving it `active` would mean the Financials card says
     * "Autopay on" while every scheduled wake refuses — the surface and the truth disagreeing about
     * a family's money. There is deliberately no fallback to another method on file: the payer
     * authorized this one.
     */
    await failArrangementsForMethod(supabase, {
        orgId: t(args.orgId),
        paymentMethodId: t(args.methodId),
        reason: "The authorized payment method was removed.",
    });

    return { ok: true, method: toRecord(data as unknown as Record<string, unknown>), providerDetached: detach.detached };
}

export type CollectionMethodResolution =
    | { ok: true; method: PaymentMethodRecord }
    | { ok: false; reason: "not_found" | "not_usable" | "wrong_account"; message: string };

/**
 * May we collect with this stored method, for this account, right now?
 *
 * The one question the collection engine asks. Scope is checked as well as usability, because a
 * method owned by a payer and scoped to account A must not settle account B's obligations even
 * inside the same organisation — ownership is not authority over every family.
 */
export async function resolveCollectionMethod(
    supabase: SupabaseClient,
    args: { orgId: string; methodId: string; customerId: string },
): Promise<CollectionMethodResolution> {
    const method = await readMethod(supabase, { orgId: args.orgId, methodId: args.methodId });
    if (!method) {
        return { ok: false, reason: "not_found", message: "That payment method is not on this organization." };
    }
    if (method.customerId && t(args.customerId) && method.customerId !== t(args.customerId)) {
        return {
            ok: false,
            reason: "wrong_account",
            message: "That payment method is not available to this account.",
        };
    }
    if (method.usabilityState !== "usable") {
        return {
            ok: false,
            reason: "not_usable",
            message:
                method.usabilityState === "revoked"
                    ? "That payment method was removed."
                    : method.usabilityState === "expired"
                        ? "That payment method has expired."
                        : method.verificationState === "pending"
                            ? "That bank account is still being verified."
                            : "That payment method cannot currently be used.",
        };
    }
    return { ok: true, method };
}

/**
 * Produce the connected-account method a direct charge will consume.
 *
 * One clone, per collection, never stored. For a bank account the mandate travels with it — which is
 * only true because the authorization was taken on the platform without `on_behalf_of`.
 */
export async function materializeMethodForMerchant(
    method: PaymentMethodRecord,
    connectedAccountRef: string,
    call: StripeFormCall = defaultStripeFormCall,
): Promise<{ ok: true; clonedMethodRef: string } | { ok: false; message: string }> {
    return await cloneMethodToMerchant(call, {
        customerRef: method.providerCustomerRef,
        methodRef: method.providerMethodRef,
        connectedAccountRef,
    });
}

export type ProviderUpdateOutcome =
    | { ok: true; method: PaymentMethodRecord | null; changed: boolean }
    | { ok: false; reason: "unbound" | "write_failed"; message: string };

/**
 * A provider event, applied to display and usability ONLY.
 *
 * Stripe can legitimately tell us a card was auto-updated by the network, or that an instrument
 * stopped working. It may never tell us whose method it is, which account may use it, or which rail
 * it is: the tenant is resolved by looking the provider reference up in Alloy's own table, and an
 * unbound reference fails closed rather than guessing a tenant from event metadata. The immutability
 * trigger refuses the rest even if this function were wrong.
 */
export async function applyProviderMethodUpdate(
    supabase: SupabaseClient,
    args: {
        providerMethodRef: string;
        processor?: string;
        /** The event's own method object, when it carried one. Re-read when it did not. */
        methodObject?: Record<string, unknown> | null;
        usability?: PaymentMethodRecord["usabilityState"] | null;
        verification?: PaymentMethodRecord["verificationState"] | null;
    },
    call: StripeFormCall = defaultStripeFormCall,
): Promise<ProviderUpdateOutcome> {
    const ref = t(args.providerMethodRef);
    const processor = t(args.processor) || "stripe";
    if (!ref) return { ok: false, reason: "unbound", message: "The event named no payment method." };

    const { data: found, error: findErr } = await supabase
        .from("payment_methods")
        .select(COLUMNS)
        .eq("processor", processor)
        .eq("provider_method_ref", ref)
        .maybeSingle();

    if (findErr) return { ok: false, reason: "write_failed", message: findErr.message };
    if (!found) {
        return {
            ok: false,
            reason: "unbound",
            message: "No stored payment method names that provider reference.",
        };
    }

    const current = toRecord(found as unknown as Record<string, unknown>);

    /* A withdrawn method is not revived by provider chatter. */
    if (current.usabilityState === "revoked") return { ok: true, method: current, changed: false };

    let display = args.methodObject ? displayFromStripeMethod(args.methodObject) : null;
    if (!display) {
        const re = await retrievePaymentMethod(call, ref);
        if (re.ok) display = re.display;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (display) {
        if (display.brand !== null) patch.display_brand = display.brand;
        if (display.last4 !== null) patch.display_last4 = display.last4;
        if (display.expMonth !== null) patch.display_exp_month = display.expMonth;
        if (display.expYear !== null) patch.display_exp_year = display.expYear;
    }
    if (args.usability) patch.usability_state = args.usability;
    if (args.verification) {
        patch.verification_state = args.verification;
        if (args.verification === "verified" && !current.verifiedAt) patch.verified_at = new Date().toISOString();
    }

    /* A method that stops being usable stops being the default, in the same statement. */
    if (args.usability && args.usability !== "usable") patch.is_default = false;

    const { data, error } = await supabase
        .from("payment_methods")
        .update(patch)
        .eq("id", current.id)
        .select(COLUMNS)
        .maybeSingle();

    if (error) return { ok: false, reason: "write_failed", message: error.message };
    const next = data ? toRecord(data as unknown as Record<string, unknown>) : current;

    /*
     * THE ACH MANDATE RULE, CONVERGED RATHER THAN RESTATED (W5).
     *
     * W3 established that a return invalidates the mandate and the canonical method stops being
     * usable. That decision is made upstream and arrives here as a usability change; this does not
     * re-derive it, it follows it. Any live arrangement standing on the method fails, because a
     * mandate that the bank refused cannot authorize the next debit either.
     */
    if (next.usabilityState !== "usable" && current.usabilityState === "usable") {
        await failArrangementsForMethod(supabase, {
            orgId: current.orgId,
            paymentMethodId: current.id,
            reason: next.usabilityState === "blocked"
                ? "The bank refused the authorization for this payment method."
                : "The authorized payment method can no longer be charged.",
        });
    }

    const changed =
        next.brand !== current.brand
        || next.last4 !== current.last4
        || next.expMonth !== current.expMonth
        || next.expYear !== current.expYear
        || next.usabilityState !== current.usabilityState
        || next.verificationState !== current.verificationState;

    return { ok: true, method: next, changed };
}

export { ACH_AUTHORIZATION_DISCLOSURE };
