/**
 * WHO CAN PAY, AND WHAT THIS ORGANISATION CAN ACTUALLY DO WITH MONEY — read, never guessed.
 *
 * ── SIX CONCEPTS THAT MUST NOT COLLAPSE ────────────────────────────────────────────────────────
 *
 *   RESPONSIBILITY   who is financially responsible for an obligation.
 *   PAYER            who actually supplied money.
 *   PAYMENT METHOD   how a payer can supply it.
 *   AUTOPAY          authorisation letting a method be used automatically under policy.
 *   PAYMENT          money received from an actual payer.
 *   APPLICATION      how received money settles obligations.
 *
 * A household may have several responsible adults, several potential payers, a payer who is not
 * responsible at all — a grandparent settling a bill — several methods, and more than one autopay
 * arrangement. Moving an application NEVER changes who actually paid.
 *
 * The card already had a `payers` field and it means RESPONSIBILITY: it is filled from persisted
 * responsibility arrangements, and the comment beside it says so ("the `payer` contact role is no
 * longer what makes somebody a payer on this card"). That is correct for what it answers and wrong
 * for the question an operator asks while recording a cheque, which is *whose cheque is this*. So
 * payer CANDIDATES are resolved here, separately, from household membership — and a candidate
 * confers no responsibility by being offered.
 *
 * ── THE HARDCODED NULL THIS REPLACES ───────────────────────────────────────────────────────────
 *
 * `buildFinancialsCardVM` shipped `paymentSetup: null` as a literal with no producer anywhere, and
 * the card adapter turned it into `autopayHealthy: false` and an absent payment line. A constant
 * was being read as a business fact about a family. Everything below is derived from rows that
 * exist, and every state it cannot establish is reported as unknown rather than as false.
 *
 * ── WHAT IS CANONICAL TODAY, AND WHAT IS NOT ───────────────────────────────────────────────────
 *
 * Canonical, and read here: the org's provider merchant and its readiness
 * (`payment_provider_merchants`), and any stored payment methods (`payment_methods`).
 * Canonical elsewhere: the payment itself, its actual payer, its method, its applications, refunds.
 *
 * CANONICAL SINCE W5: AUTOPAY. `payment_autopay_arrangements` is the authority, and this reads it.
 * The previous note here said Autopay had "no table, no column and no writer" and was therefore
 * reported `unsupported` — the truthful answer at the time, and the reason that constant is gone
 * rather than edited. What replaced it is a measurement: an account either has an authorization or
 * it does not, and "no Autopay" now means no row rather than no implementation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** A person this household's money could come from. Offered, and carrying no obligation. */
export type PayerCandidate = {
    personId: string;
    name: string;
    /** The household relationship, in the organisation's own vocabulary. Never invented. */
    roleType: string | null;
    isPrimaryContact: boolean;
    /**
     * True when this person also carries persisted responsibility on the account. Reported so an
     * operator can see the overlap — never used to order, filter or default the choice, because
     * defaulting the payer to the responsible party is exactly the collapse this model forbids.
     */
    alsoResponsible: boolean;
};

/**
 * What this organisation can do with money right now.
 *
 * Five states, and the distinction between the first two is the whole point: `unsupported` means
 * Alloy has no implementation to offer, `not_configured` means it has one and this organisation has
 * not set it up. An operator can act on the second and can only be told about the first.
 */
export type PaymentCapabilityState =
    | "unsupported"
    | "not_configured"
    | "pending"
    | "available"
    | "failed";

export type PaymentSetupState = {
    /** Recording money that arrived outside a provider. Never provider-dependent. */
    recordPayment: { state: PaymentCapabilityState; reason: string | null };
    /** Provider-backed card collection. */
    takePaymentCard: { state: PaymentCapabilityState; reason: string | null };
    /** Provider-backed bank debit. */
    takePaymentAch: { state: PaymentCapabilityState; reason: string | null };
    /** Adding, removing or replacing a stored payment method. */
    manageMethods: { state: PaymentCapabilityState; reason: string | null };
    autopay: { state: PaymentCapabilityState; reason: string | null };
    /**
     * The canonical arrangement, when one exists (Payments W5).
     *
     * Null means NO arrangement — which is a measurement now, not an absence of implementation.
     * The `autopay` capability above still answers whether Autopay can be SET UP; this answers what
     * is actually authorized today.
     */
    autopayArrangement: {
        id: string;
        status: "active" | "paused" | "revoked" | "failed";
        payerEntityId: string;
        paymentMethodId: string;
        effectiveFrom: string;
        effectiveTo: string | null;
        maxAmountCents: number | null;
        timingOffsetDays: number;
        lastAttemptAt: string | null;
        lastFailureReason: string | null;
        /** The one sentence a compact surface shows. */
        summaryLine: string;
        /** True when an operator needs to do something. Drives the attention treatment. */
        needsAttention: boolean;
    } | null;
    /**
     * Methods already on file for this household, if any. Identifiers and safe display only; never
     * a secret, and never a provider reference.
     *
     * Revoked methods are INCLUDED, carrying `usabilityState: "revoked"`. A surface that wants only
     * the live ones filters; a surface that drops them silently cannot tell an operator who just
     * removed a card that anything happened.
     */
    methodsOnFile: Array<{
        id: string;
        brand: string | null;
        last4: string | null;
        isDefault: boolean;
        rail: "card" | "ach";
        usabilityState: "usable" | "blocked" | "expired" | "revoked";
        verificationState: "unverified" | "pending" | "verified" | "failed";
        expMonth: number | null;
        expYear: number | null;
    }>;
    /**
     * The four questions an operator surface asks about stored methods, answered once here rather
     * than re-derived by every caller.
     */
    methodSummary: {
        hasUsableMethod: boolean;
        usableRails: Array<"card" | "ach">;
        defaultCardId: string | null;
        defaultAchId: string | null;
        /** A bank account the payer has added but the provider has not finished verifying. */
        awaitingVerification: number;
        /** Expired or blocked — on file, but it will not collect until it is replaced. */
        needsReplacement: number;
    };
    /** The org's merchant, as the provider last answered. Null when no merchant row exists. */
    merchant: { processor: string; readiness: string; achReadiness: string | null } | null;
    /**
     * The one line a compact surface may show. Null when there is genuinely nothing to say — which
     * is different from "no payment method on file", a claim this cannot make without looking.
     */
    summaryLine: string | null;
};

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

/**
 * Everyone whose money this account could legitimately receive.
 *
 * Household membership is the source, because that is what the relationship actually is. A payer
 * who is not on the household — a grandparent, an employer — is representable in the payment record
 * itself (`payer_entity_type` / `payer_entity_id` are open), and this chooser being a convenience
 * rather than a boundary is deliberate: `recordChildcarePayment` accepts the payer it is given.
 *
 * A read that FAILS returns an empty list, and the caller must present that as "could not be read"
 * rather than as "this family has nobody who can pay".
 */
export async function resolvePayerCandidates(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; responsiblePersonIds?: readonly string[] },
): Promise<{ candidates: PayerCandidate[]; readFailed: boolean }> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    if (!orgId || !customerId) return { candidates: [], readFailed: false };

    const { data, error } = await supabase
        .from("customer_persons")
        .select("person_id, role_type, is_primary, status, end_date, persons(first_name, last_name)")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    if (error) return { candidates: [], readFailed: true };

    const responsible = new Set((args.responsiblePersonIds ?? []).map((id) => t(id)).filter(Boolean));
    const rows = (data ?? []) as Array<{
        person_id: string | null;
        role_type: string | null;
        is_primary: boolean | null;
        status: string | null;
        end_date: string | null;
        persons: { first_name?: string | null; last_name?: string | null } | null;
    }>;

    const candidates = rows
        .map((row): PayerCandidate | null => {
            const personId = t(row.person_id);
            if (!personId) return null;
            /* An ended relationship is history, not a payer you would offer today. */
            if (t(row.end_date)) return null;
            if (t(row.status).toLowerCase() === "inactive") return null;
            /*
             * THE CHILD IS THE SUBJECT, NOT A PAYER.
             *
             * `customer_persons` is meant to be the adult edge — the durable household composer
             * says so in as many words, children carrying their identity on the member row — but
             * the certification tenant has children on it too, and the chooser duly offered a
             * four-year-old as the person who paid the bill. Role types are organisation-configured
             * vocabulary, so this excludes the canonical `child` key rather than guessing at
             * synonyms; a household that renames the role keeps its own word and this reads it.
             */
            if (t(row.role_type).toLowerCase() === "child") return null;
            const name =
                [t(row.persons?.first_name), t(row.persons?.last_name)].filter(Boolean).join(" ")
                || "Unnamed contact";
            return {
                personId,
                name,
                roleType: t(row.role_type) || null,
                isPrimaryContact: row.is_primary === true,
                alsoResponsible: responsible.has(personId),
            };
        })
        .filter((c): c is PayerCandidate => c !== null);

    /*
     * Primary contact first, then by name. NOT responsibility-first: ordering the chooser by who
     * owes the money is how an operator ends up recording the responsible party as the payer
     * without noticing, which is the defect this whole distinction exists to prevent.
     */
    candidates.sort((a, b) => {
        if (a.isPrimaryContact !== b.isPrimaryContact) return a.isPrimaryContact ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    /* De-duplicated: one person may hold two roles on the same household. */
    const seen = new Set<string>();
    return {
        candidates: candidates.filter((c) => (seen.has(c.personId) ? false : (seen.add(c.personId), true))),
        readFailed: false,
    };
}

/**
 * The one sentence a compact surface shows for an arrangement, and the attention verdict.
 *
 * "Needs attention" is deliberately narrow: only states an OPERATOR can act on. A paused
 * arrangement is a decision somebody made, not a problem, so it reads as paused and nothing flashes.
 */
function autopayPresentation(row: {
    status: string;
    lastFailureReason: string | null;
}): { summaryLine: string; needsAttention: boolean } {
    if (row.status === "failed") {
        return {
            summaryLine: row.lastFailureReason?.trim() || "Autopay needs attention",
            needsAttention: true,
        };
    }
    if (row.status === "paused") return { summaryLine: "Autopay paused", needsAttention: false };
    if (row.status === "revoked") return { summaryLine: "No Autopay", needsAttention: false };
    /*
     * An ACTIVE arrangement may still carry the last refusal — most often "amount due exceeds the
     * Autopay authorization", which is the case an operator must see because nothing will collect
     * until they act, and yet the arrangement is perfectly healthy.
     */
    if (row.lastFailureReason?.trim()) {
        return { summaryLine: row.lastFailureReason.trim(), needsAttention: true };
    }
    return { summaryLine: "Autopay on", needsAttention: false };
}

export async function resolvePaymentSetup(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string | null },
): Promise<PaymentSetupState> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);

    const [merchantRow, methodRows, autopayRow] = await Promise.all([
        orgId
            ? supabase
                  .from("payment_provider_merchants")
                  .select("processor, readiness, ach_readiness, is_active")
                  .eq("org_id", orgId)
                  .eq("is_active", true)
                  .limit(1)
                  .maybeSingle()
                  .then((r) => (r.error ? null : (r.data as Record<string, unknown> | null)))
            : Promise.resolve(null),
        /*
         * ── THE CANONICAL METHOD READ ──────────────────────────────────────────────────────────
         *
         * This used to read `customer_payment_methods` filtered by customer ALONE — no org column
         * existed to filter on, so the read was cross-tenant by construction. W2's table carries
         * `org_id`, and this read now names it. That is not a tightening of an existing check; it
         * is the first time this question could be asked safely at all.
         */
        customerId && orgId
            ? supabase
                  .from("payment_methods")
                  .select(
                      "id, display_brand, display_last4, display_exp_month, display_exp_year, "
                      + "is_default, rail, usability_state, verification_state",
                  )
                  .eq("org_id", orgId)
                  .eq("customer_id", customerId)
                  .order("created_at", { ascending: false })
                  .then((r) => (r.error ? [] : ((r.data ?? []) as unknown as Array<Record<string, unknown>>)))
            : Promise.resolve([] as Array<Record<string, unknown>>),
        /*
         * THE CANONICAL AUTOPAY READ (W5). Live statuses only: a revoked arrangement is history,
         * and surfacing it would tell an operator Autopay exists when the payer withdrew it.
         */
        customerId && orgId
            ? supabase
                  .from("payment_autopay_arrangements")
                  .select(
                      "id, status, payer_entity_id, payment_method_id, effective_from, effective_to, "
                      + "max_amount_cents, timing_offset_days, last_attempt_at, last_failure_reason",
                  )
                  .eq("org_id", orgId)
                  .eq("customer_id", customerId)
                  .in("status", ["active", "paused", "failed"])
                  .order("authorized_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
                  .then((r) => (r.error ? null : (r.data as Record<string, unknown> | null)))
            : Promise.resolve(null),
    ]);

    const readiness = t(merchantRow?.readiness) || null;
    const achReadiness = t(merchantRow?.ach_readiness) || null;
    const merchant = merchantRow
        ? { processor: t(merchantRow.processor) || "unknown", readiness: readiness ?? "unknown", achReadiness }
        : null;

    const methodsOnFile = methodRows.map((m) => ({
        id: t(m.id),
        brand: t(m.display_brand) || null,
        last4: t(m.display_last4) || null,
        isDefault: m.is_default === true,
        rail: (t(m.rail) === "ach" ? "ach" : "card") as "card" | "ach",
        usabilityState: (t(m.usability_state) || "usable") as PaymentSetupState["methodsOnFile"][number]["usabilityState"],
        verificationState: (t(m.verification_state) || "unverified") as PaymentSetupState["methodsOnFile"][number]["verificationState"],
        expMonth: m.display_exp_month != null ? Number(m.display_exp_month) : null,
        expYear: m.display_exp_year != null ? Number(m.display_exp_year) : null,
    }));

    const usable = methodsOnFile.filter((m) => m.usabilityState === "usable");
    const methodSummary = {
        hasUsableMethod: usable.length > 0,
        usableRails: (["card", "ach"] as const).filter((r) => usable.some((m) => m.rail === r)),
        defaultCardId: usable.find((m) => m.isDefault && m.rail === "card")?.id ?? null,
        defaultAchId: usable.find((m) => m.isDefault && m.rail === "ach")?.id ?? null,
        awaitingVerification: methodsOnFile.filter(
            (m) => m.verificationState === "pending" && m.usabilityState !== "revoked",
        ).length,
        needsReplacement: methodsOnFile.filter(
            (m) => m.usabilityState === "expired" || m.usabilityState === "blocked",
        ).length,
    };

    /* Cash, cheque and money order need no merchant. This is the capability that is always there. */
    const recordPayment = { state: "available" as PaymentCapabilityState, reason: null };

    const autopayStatus = t(autopayRow?.status);
    const autopayArrangement = autopayRow && autopayStatus
        ? (() => {
              const presentation = autopayPresentation({
                  status: autopayStatus,
                  lastFailureReason: t(autopayRow.last_failure_reason) || null,
              });
              return {
                  id: t(autopayRow.id),
                  status: autopayStatus as "active" | "paused" | "revoked" | "failed",
                  payerEntityId: t(autopayRow.payer_entity_id),
                  paymentMethodId: t(autopayRow.payment_method_id),
                  effectiveFrom: t(autopayRow.effective_from),
                  effectiveTo: t(autopayRow.effective_to) || null,
                  maxAmountCents: autopayRow.max_amount_cents == null ? null : Number(autopayRow.max_amount_cents),
                  timingOffsetDays: Number(autopayRow.timing_offset_days ?? 0),
                  lastAttemptAt: t(autopayRow.last_attempt_at) || null,
                  lastFailureReason: t(autopayRow.last_failure_reason) || null,
                  ...presentation,
              };
          })()
        : null;

    /*
     * The CAPABILITY answers "can Autopay be set up here", which needs a usable method and a
     * merchant that can charge it. It is not the same question as "is Autopay on", which the
     * arrangement above answers — an account can have Autopay active while the merchant is
     * temporarily restricted, and a surface that conflated the two would offer to set up something
     * already running.
     */
    const autopayCapability: { state: PaymentCapabilityState; reason: string | null } = !merchant
        ? { state: "not_configured", reason: NO_MERCHANT }
        : !methodSummary.hasUsableMethod
          ? { state: "not_configured", reason: "No usable payment method is on file for this account." }
          : { state: "available", reason: null };

    const card = merchantCapability(merchant?.readiness ?? null, "card");
    /*
     * ── A RAIL NEEDS THE MERCHANT BEFORE IT NEEDS ITSELF ────────────────────────────────────────
     *
     * `ach_readiness` answered this alone, which let a merchant that cannot accept a single charge
     * report bank debit as `available` — its ACH capability said `ready` and nothing asked whether
     * the account could collect at all. Collection refused it correctly; the operator had simply
     * been told otherwise.
     *
     * So when merchant-level readiness does not permit collection, ACH reports the MERCHANT's state
     * and the merchant's reason. That is the truthful answer: the blocker is the account, not the
     * rail, and telling an operator "bank debit is not enabled" would send them to fix the wrong
     * thing.
     */
    const ach = !merchant
        ? { state: "not_configured" as PaymentCapabilityState, reason: NO_MERCHANT }
        : card.state !== "available"
            ? card
            : achReadiness === "ready"
                ? { state: "available" as PaymentCapabilityState, reason: null }
                : {
                      state: "not_configured" as PaymentCapabilityState,
                      reason: achReadiness
                          ? `The provider reports bank debit as ${achReadiness.replace(/_/g, " ")}.`
                          : "Bank debit has not been enabled on this organisation's merchant account.",
                  };

    return {
        recordPayment,
        takePaymentCard: card,
        takePaymentAch: ach,
        /*
         * ── MANAGING METHODS IS NO LONGER UNSUPPORTED ──────────────────────────────────────────
         *
         * It reported `unsupported` truthfully for as long as Alloy had no canonical table and no
         * writer. W2 gives it both, so the honest answer is now the ORGANISATION's: storing a method
         * needs provider tokenisation, which needs a connected merchant. With one, this is
         * `available` whether or not any method exists yet — having none is not an incapacity.
         */
        manageMethods: merchant
            ? card.state === "available" || card.state === "pending"
                ? { state: "available" as PaymentCapabilityState, reason: null }
                : card
            : { state: "not_configured" as PaymentCapabilityState, reason: NO_MERCHANT },
        autopay: autopayCapability,
        autopayArrangement,
        methodsOnFile,
        methodSummary,
        merchant,
        summaryLine: summarise(methodsOnFile, methodSummary, card.state),
    };
}

const NO_MERCHANT = "No payment provider is connected for this organisation.";

function merchantCapability(readiness: string | null, _rail: "card"): { state: PaymentCapabilityState; reason: string | null } {
    if (!readiness) return { state: "not_configured", reason: NO_MERCHANT };
    switch (readiness) {
        case "ready":
            return { state: "available", reason: null };
        case "onboarding_incomplete":
            return { state: "pending", reason: "The organisation has not finished provider onboarding." };
        case "restricted":
            return { state: "failed", reason: "The provider has restricted this merchant account; charges are refused." };
        case "not_connected":
            return { state: "not_configured", reason: NO_MERCHANT };
        default:
            /* An unrecognised provider state is unknown, never quietly "fine". */
            return { state: "pending", reason: `The provider reports this merchant as ${readiness.replace(/_/g, " ")}.` };
    }
}

/**
 * The one line a compact surface may show.
 *
 * Null when there is nothing established to say. "No payment method on file" is a CLAIM, and the
 * compact card used to make it from a hardcoded null without ever looking; it is only said here
 * when a household genuinely has no stored method AND storing one is a thing this organisation
 * could do.
 */
function summarise(
    methods: PaymentSetupState["methodsOnFile"],
    summary: PaymentSetupState["methodSummary"],
    cardState: PaymentCapabilityState,
): string | null {
    /*
     * A COMPACT SURFACE GETS ONE TRUE SENTENCE, and the order matters.
     *
     * A usable method is the answer whenever there is one. Otherwise a method awaiting verification
     * is more informative than silence — the family HAS given their bank details and somebody is
     * waiting on a deposit, which is a different situation from having done nothing.
     */
    const usable = methods.filter((m) => m.usabilityState === "usable");
    const preferred = usable.find((m) => m.isDefault) ?? usable[0];
    if (preferred) {
        const label = [preferred.brand, preferred.last4 ? `•••• ${preferred.last4}` : null]
            .filter(Boolean)
            .join(" ");
        if (label) return label;
        return preferred.rail === "ach" ? "Bank account on file" : "Card on file";
    }
    if (summary.awaitingVerification > 0) return "Bank account awaiting verification";
    if (summary.needsReplacement > 0) return "Payment method needs attention";
    if (cardState === "available") return "No payment method on file";
    return null;
}
