/**
 * An obligation whose canonical owner exists in the product plan but not yet in the product.
 *
 * The certification corpus found four document-shaped obligations. Three are documents. The fourth
 * is this sentence from the family handbook:
 *
 *     "To update information provided in your ACH account, please complete an updated electronic
 *      ACH form by the 10th of the month prior to the change."
 *
 * A legacy school packet expresses payment setup through paperwork, and a reader that only knows
 * "clause asks for a form" turns that sentence into a file upload. That would have been the wrong
 * end state twice over: the family would be asked to attach a bank document, and Alloy would hold
 * account credentials it must never hold. The obligation is real — the school does require payment
 * setup — but its owner is Financials/Payments, whose contract (family authorizes a method with the
 * provider; Alloy keeps the resulting authorization evidence) is not implemented yet.
 *
 * So the honest state is neither "upload" nor "gone". It is DEFERRED: recorded with its lineage,
 * attributed to its intended owner, and visible everywhere the packet is inspected.
 *
 * ── On vocabulary ────────────────────────────────────────────────────────────────────────────────
 * No new hold vocabulary is introduced here. `FINANCIAL_PAYMENT` (owner) and `HELD_PENDING_FINANCIALS`
 * (state) already exist in `ownershipRouting`, and the `financial_payment` disposition already exists
 * in the proposal contract. A deferral IS that hold, reached by a clause instead of a destination.
 * What is genuinely new — and all that is new — is the OBLIGATION IDENTITY: naming what the clause
 * asks for, so "deferred payment setup" can never be read as "we dropped a document".
 *
 * Pure + deterministic. No I/O.
 */

import type { DeferredCapability } from "./contracts";

/** The one obligation this module can name today. Widening it is an ownership decision, not a regex. */
export const PAYMENT_SETUP_REQUIRED = "PAYMENT_SETUP_REQUIRED" as const;

/**
 * Establishing, authorizing, or updating a way to be paid.
 *
 * Deliberately narrower than "mentions money": a tuition AMOUNT is billing configuration and is
 * already routed as such, and an ordinary document clause that happens to sit on a payment page is
 * still a document. What matches here is a payment INSTRUMENT or its authorization.
 */
const PAYMENT_SETUP_CLAUSE =
    /\b(ach|auto-?pay|automatic\s+(payment|withdrawal|draft|debit)s?|direct\s+(debit|deposit|payment)|bank\s+draft|e-?check|electronic\s+funds?\s+transfer|eft|payment\s+(method|authorization|authorisation|arrangement|information|details)|card\s+authorization|voided\s+check)\b/i;

/**
 * The owner named in operator language. Financials/Payments is a program, not a table, and this
 * string is what an operator reads in Studio — so it says the program, never the disposition.
 */
export const DEFERRED_OWNER_LABEL = "Financials / Payments";

export interface DeferredCapabilityInput {
    label: string;
    concept_key?: string;
    concept_id: string;
    section_title?: string;
    page?: number;
}

/**
 * Is this obligation payment setup rather than a document?
 *
 * Returns the complete concept-grain deferral record, or null. Document lineage (which file, which
 * checksum, which artifacts relate) is added where the document is known — see the packet
 * realization — because a proposal does not know which source it came from.
 */
export function deferredCapabilityFor(input: DeferredCapabilityInput): DeferredCapability | null {
    const text = `${input.label ?? ""} ${(input.concept_key ?? "").replace(/[._]/g, " ")}`;
    if (!PAYMENT_SETUP_CLAUSE.test(text)) return null;
    return {
        obligation: PAYMENT_SETUP_REQUIRED,
        hold_state: "HELD_PENDING_FINANCIALS",
        intended_owner: "FINANCIAL_PAYMENT",
        owner_label: DEFERRED_OWNER_LABEL,
        reason:
            "Payment setup. The family authorizes a payment method with the payment provider and Alloy keeps the authorization that comes back — so this is not a document a parent should be asked to attach, and the account details behind it never become Alloy fields. Financials/Payments owns that experience and does not define it yet, so the requirement is held rather than built.",
        clause: input.label,
        concept_id: input.concept_id,
        ...(input.section_title ? { section_title: input.section_title } : {}),
        ...(typeof input.page === "number" ? { page: input.page } : {}),
    };
}
