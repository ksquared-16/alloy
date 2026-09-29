/**
 * WHAT A PARTICIPANT MAY SEE AND DO ABOUT AN ENROLMENT FEE — and nothing beyond it.
 *
 * The fee requirement, its obligations and every figure already exist and are already canonical
 * (`readEnrollmentFeeProjection` over Financials). The payment ENGINE already exists too, and is
 * mature: `createCardCollection` validates the amount against `resolveFamilyCollectible`, refuses a
 * provider reference from a browser, refuses a stored method owned by a different payer, and posts
 * through `collectionRecognition` → `canonicalPosting` so a payment and its application are written
 * once, by Financials, on provider confirmation.
 *
 * What did not exist was a way for the PARENT to reach any of it. There was no public route that
 * records a payment against a childcare charge, so a family could be shown a fee they had no way to
 * pay. This module is that reach, and it is deliberately thin: it resolves who the payer is, asks
 * the canonical readers what is true, and hands the engine an obligation the token itself proves the
 * participant is entitled to act on.
 *
 * ── WHY THIS IS NOT A SECOND PAYMENT SYSTEM ──
 *
 * It computes no money. Not gross, not collectible, not remaining, not a subsidy offset. Every cent
 * below is copied from a canonical answer, and the one number the participant supplies — how much to
 * pay — is validated by the engine against `resolveFamilyCollectible` rather than by anything here.
 * There is no Enrollment payment status column either: state is read from the bridge each time.
 *
 * ── THE OBLIGATION SET IS DERIVED, NEVER ACCEPTED ──
 *
 * A participant names an obligation to pay, and the server does not take their word for which
 * charges exist. The payable set is recomputed from the token's own projection on every request and
 * the named charge must be a member of it. So a manipulated charge id cannot reach the engine at
 * all, and the engine's own account and org scoping is the second line rather than the only one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPayerUsableMethods, type PaymentMethodRecord } from "@/lib/financials/payments/paymentMethodService";
import { railCollectionAvailable } from "@/lib/financials/payments/providerMerchant";
import type { EnrollmentFinancialRequirementProjection } from "@/lib/enrollment/financial/enrollmentFinancialRequirement";

/** A payer this participant is provably entitled to pay as. */
export type ParticipantPayer = {
    readonly personId: string;
    readonly name: string;
};

/** One thing owed, as a parent reads it. No ledger vocabulary, no provider references. */
export type ParticipantPaymentLine = {
    /** Internal identity, used to name the obligation back on POST. Never a provider reference. */
    readonly chargeId: string;
    /** "Emma" for a child fee, null when the fee is the household's. */
    readonly subjectCustomerMemberId: string | null;
    readonly subjectName: string | null;
    readonly label: string;
    readonly collectibleNowCents: number;
    readonly state: string;
};

/** A saved instrument, in the only terms a participant needs. */
export type ParticipantMethod = {
    readonly id: string;
    readonly rail: "card" | "ach";
    readonly brand: string | null;
    readonly last4: string | null;
    readonly isDefault: boolean;
};

export type ParticipantPaymentView = {
    /** Copied from the canonical bridge. Enrollment stores no payment status of its own. */
    readonly state: EnrollmentFinancialRequirementProjection["state"];
    readonly label: string;
    readonly explanation: string;
    readonly currencyCode: string | null;
    readonly grossCents: number;
    readonly collectibleNowCents: number;
    readonly appliedCents: number;
    readonly outstandingCents: number;
    /** True when there is something a participant can actually do right now. */
    readonly payable: boolean;
    readonly payer: ParticipantPayer | null;
    readonly lines: readonly ParticipantPaymentLine[];
    readonly methods: readonly ParticipantMethod[];
    /** Rails this organisation's merchant can truthfully execute today. */
    readonly rails: readonly ("card" | "ach")[];
    /** Present when the participant cannot pay and deserves to know why. */
    readonly unpayableReason: string | null;
};

/**
 * WHO THE PARTICIPANT IS, PROVEN — not inferred from a name or an email address.
 *
 * The link the parent arrived on carries `metadata.recipient_person_id`, and that value is not a
 * hint: `resolveOpportunityEnrollmentSelection` validated it at mint against an allowed set built
 * from the opportunity's primary person, the selected child's person and the household's primary
 * contact. So the token hashes to a link, and the link names a canonical person an operator
 * deliberately addressed. That is a chain of custody; matching a display name is not, which is why
 * nothing here reads one.
 *
 * A link minted without a recipient yields NO payer. That is the honest answer, and it produces a
 * screen that says payment cannot be taken yet rather than one that guesses an identity and puts a
 * receipt in the ledger under it.
 */
export async function resolveParticipantPayer(
    supabase: SupabaseClient,
    args: { orgId: string; linkId: string; customerId: string },
): Promise<ParticipantPayer | null> {
    const { data: linkRow } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.linkId)
        .maybeSingle();
    const metadata = ((linkRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const personId = typeof metadata.recipient_person_id === "string" ? metadata.recipient_person_id.trim() : "";
    if (!personId) return null;

    /*
     * Re-read the person in THIS org. The mint validated them, and a validation that happened once
     * in the past is not a substitute for the row existing now — a person can be merged or removed,
     * and a payer who no longer exists must not be offered.
     */
    const { data: person } = await supabase
        .from("persons")
        .select("id, first_name, last_name")
        .eq("org_id", args.orgId)
        .eq("id", personId)
        .maybeSingle();
    if (!person) return null;
    const row = person as { id: string; first_name?: string | null; last_name?: string | null };
    const name = [row.first_name, row.last_name].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
    return { personId: row.id, name: name || "You" };
}

/** The states in which money can actually be taken. Read from the bridge, never re-derived. */
const PAYABLE_STATES: ReadonlySet<string> = new Set(["DUE", "PARTIALLY_SATISFIED"]);

function methodView(m: PaymentMethodRecord): ParticipantMethod {
    // Deliberately narrow. `providerCustomerRef`, `providerMethodRef`, `mandateRef` and the
    // verification internals stay server-side; a participant needs to recognise their card, not to
    // hold a reference that identifies it to Stripe.
    return { id: m.id, rail: m.rail, brand: m.brand, last4: m.last4, isDefault: m.isDefault };
}

/**
 * Compose the participant's payment view from canonical answers.
 *
 * Every figure is copied. The only judgement is what a parent is allowed to see, and what to say
 * when they cannot pay.
 */
export function buildParticipantPaymentView(input: {
    readonly projection: EnrollmentFinancialRequirementProjection;
    readonly payer: ParticipantPayer | null;
    readonly methods: readonly PaymentMethodRecord[];
    readonly merchant: { readonly readiness?: string | null; readonly achReadiness?: string | null } | null;
    readonly childNames: ReadonlyMap<string, string>;
    readonly label?: string;
}): ParticipantPaymentView {
    const { projection, payer } = input;
    const rails = (["card", "ach"] as const).filter((r) => railCollectionAvailable(input.merchant, r));

    const lines: ParticipantPaymentLine[] = projection.obligations.map((o) => {
        const subject = o.subjectCustomerMemberId;
        const subjectName = subject ? (input.childNames.get(subject) ?? null) : null;
        return {
            chargeId: o.position?.chargeId ?? "",
            subjectCustomerMemberId: subject,
            subjectName,
            // A child's fee reads as the child's. A household fee is simply the fee.
            label: subjectName ? `${subjectName} — enrollment fee` : "Enrollment fee",
            collectibleNowCents: o.position?.currentlyCollectibleCents ?? 0,
            state: o.state,
        };
    });

    const stateIsPayable = PAYABLE_STATES.has(projection.state);
    const anythingCollectible = projection.amounts.collectibleNowCents > 0;
    const hasPayableLine = lines.some((l) => l.chargeId && l.collectibleNowCents > 0);

    /*
     * WHY NOT PAYABLE, SAID PLAINLY.
     *
     * Order matters: the first true reason is the one a parent can act on. "No payment method" is
     * last because it is the only one they can fix themselves, and saying it while the fee is not
     * even due would send them to add a card for nothing.
     */
    let unpayableReason: string | null = null;
    if (!stateIsPayable || !anythingCollectible || !hasPayableLine) {
        unpayableReason =
            projection.state === "SATISFIED" ? null
            : projection.state === "PROCESSING" ? "A payment is still processing."
            : projection.state === "NOT_DUE" ? "This fee is not due yet."
            : projection.state === "NOT_APPLICABLE" ? null
            : projection.state === "ATTENTION_REQUIRED" ? "This fee needs attention from the school."
            : "Nothing is payable on this fee right now.";
    } else if (!payer) {
        unpayableReason = "We could not confirm who is paying. Please contact the school.";
    } else if (rails.length === 0) {
        unpayableReason = "This school cannot accept online payments yet.";
    }

    return {
        state: projection.state,
        label: input.label ?? "Enrollment fee",
        explanation: projection.explanation,
        currencyCode: projection.amounts.currencyCode,
        grossCents: projection.amounts.grossCents,
        collectibleNowCents: projection.amounts.collectibleNowCents,
        appliedCents: projection.amounts.appliedCents,
        outstandingCents: projection.amounts.outstandingCents,
        payable: stateIsPayable && anythingCollectible && hasPayableLine && Boolean(payer) && rails.length > 0,
        payer,
        lines,
        // A payer with no payer, or no rails, is offered nothing — there is nothing they could do
        // with a method list, and it is not theirs to see if we cannot establish who they are.
        methods: payer ? input.methods.map(methodView) : [],
        rails,
        unpayableReason,
    };
}

/**
 * The charges this participant may name, derived from the projection they were just shown.
 *
 * This is the boundary that makes a manipulated `charge_id` unreachable rather than merely refused
 * late. The engine would also refuse a charge from another org or account — but "also" is the point:
 * a participant should never get as far as the engine with an obligation that is not theirs.
 */
export function payableChargeIds(projection: EnrollmentFinancialRequirementProjection): ReadonlySet<string> {
    const out = new Set<string>();
    for (const o of projection.obligations) {
        const id = o.position?.chargeId;
        // A reversed obligation is not payable, and neither is one with no position: there is
        // nothing to collect against in either case.
        if (id && !o.reversedByChargeId && (o.position?.currentlyCollectibleCents ?? 0) > 0) out.add(id);
    }
    return out;
}
