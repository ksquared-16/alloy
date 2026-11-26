/**
 * THE PAYER'S OWN WAY TO PUT A BANK ACCOUNT ON FILE — and the reason it cannot be the operator's.
 *
 * Everything needed to store a bank account already existed and is reused unchanged: the platform
 * customer, the provider-hosted setup, the mandate the provider takes, the four safe display fields,
 * the canonical `payment_methods` row and the webhook that finishes a verification days later.
 * What did not exist was a way for the PARENT to reach any of it. The only caller of
 * `beginAddPaymentMethod` was an operator action, whose own header describes the intended shape —
 * "`ops` does it at the front desk while the parent is standing there".
 *
 * ── WHY THAT SHAPE IS FINE FOR A CARD AND WRONG FOR A BANK ACCOUNT ──
 *
 * A card handed across a desk is the payer's own act: they hold it out, and Stripe's fields take it
 * without Alloy or the operator seeing a number. A bank account is not handed across a desk. Its
 * routing and account numbers are read off a cheque or typed out of online banking, and the ACH
 * mandate is a legal authorization by the ACCOUNT HOLDER to debit that account — something an
 * operator cannot accept on their behalf, whatever they are told over the counter.
 *
 * So this surface exists, and it is the payer's. An operator can ASK for it (a link to the payer),
 * and the asking authorizes nothing: no row is written by the request, and the method that
 * eventually appears is owned by the person who completed it, resolved from the link's canonical
 * recipient rather than from whoever requested the setup.
 *
 * ── THIS COMPUTES NOTHING AND STORES NOTHING ──
 *
 * It composes a view. Every fact in it is read from a canonical answer, and the four sentences it
 * chooses between are English for states the domain already decided. There is no second payment
 * method store, no second verification model, and no provider vocabulary — `SetupIntent`,
 * `us_bank_account`, `requires_action` and `verify_with_microdeposits` all stop well below this file
 * and none of them is a thing to say to a parent.
 */

import { ACH_AUTHORIZATION_DISCLOSURE, type PaymentMethodRecord } from "@/lib/financials/payments/paymentMethodService";
import { railCollectionAvailable } from "@/lib/financials/payments/providerMerchant";

/** A payer this participant is provably entitled to act as. Mirrors `ParticipantPayer`. */
export type BankSetupPayer = {
    readonly personId: string;
    readonly name: string;
};

/**
 * WHERE A SAVED METHOD HAS GOT TO, in the four states a parent can act on.
 *
 * Deliberately NOT the canonical pair. `verification_state` × `usability_state` is sixteen
 * combinations describing what Alloy may do with an instrument; a parent has one question — can this
 * pay, and if not is it on me — and these are its answers.
 */
export type ParticipantMethodStatus = "ready" | "confirming" | "needs_you" | "unusable";

/** A saved instrument as the person who owns it reads it. Four safe fields, and never a reference. */
export type ParticipantSavedMethod = {
    readonly id: string;
    readonly rail: "card" | "ach";
    /** The bank's name for an account, the network for a card. Never an account or routing number. */
    readonly label: string;
    readonly last4: string | null;
    readonly isDefault: boolean;
    readonly status: ParticipantMethodStatus;
    readonly statusLabel: string;
    /** What to do about it, when there is something to do. */
    readonly statusDetail: string | null;
};

export type ParticipantBankSetupView = {
    readonly payer: BankSetupPayer | null;
    /** True only when a payer is known AND this organisation can actually collect by bank. */
    readonly canAddBankAccount: boolean;
    /** Why not, in the parent's terms. Null when they can. */
    readonly unavailableReason: string | null;
    /**
     * Rendered VERBATIM above the provider's own mandate terms. It is the platform's authorization
     * sentence and it is not editable here — see `ACH_AUTHORIZATION_DISCLOSURE`.
     */
    readonly authorizationDisclosure: string;
    /** This payer's own methods. Never the household's, and never a co-parent's. */
    readonly savedMethods: readonly ParticipantSavedMethod[];
};

function bankLabel(method: PaymentMethodRecord): string {
    const brand = (method.brand ?? "").trim();
    if (brand) return brand;
    return method.rail === "ach" ? "Bank account" : "Card";
}

/**
 * The canonical pair, said once, in English.
 *
 * `pending` is the case this exists for. It is a real bank account that simply cannot be charged
 * yet, because the payer must confirm two small deposits their bank will show in a day or two — and
 * only the payer can, because only they can see them. Calling it "unverified" or leaving it out
 * would both be lies: one blames them for a wait, the other hides an account they gave us.
 */
export function participantMethodStatus(method: PaymentMethodRecord): {
    status: ParticipantMethodStatus;
    label: string;
    detail: string | null;
} {
    if (method.usabilityState === "revoked") {
        return { status: "unusable", label: "Removed", detail: "This was removed and is not used for payments." };
    }
    if (method.usabilityState === "expired") {
        return { status: "unusable", label: "Expired", detail: "Add it again to keep using it." };
    }
    if (method.verificationState === "verified" && method.usabilityState === "usable") {
        return { status: "ready", label: "Ready to use", detail: null };
    }
    if (method.verificationState === "pending") {
        return {
            status: "needs_you",
            label: "Confirm two small deposits",
            detail:
                "Your bank will show two small deposits within a day or two. Come back and enter "
                + "them to finish setting this up. Only you can see them, so only you can do this.",
        };
    }
    if (method.verificationState === "failed") {
        return {
            status: "unusable",
            label: "Could not be set up",
            detail: "Nothing was saved from that attempt. You can try again with the same account.",
        };
    }
    /* `unverified` + anything, and every state the domain has not named. Honest, and never usable. */
    return {
        status: "confirming",
        label: "Still being checked",
        detail: "Your bank is still confirming this. Nothing is needed from you right now.",
    };
}

export function participantMethodView(method: PaymentMethodRecord): ParticipantSavedMethod {
    const state = participantMethodStatus(method);
    return {
        id: method.id,
        rail: method.rail,
        label: bankLabel(method),
        last4: method.last4,
        isDefault: method.isDefault,
        status: state.status,
        statusLabel: state.label,
        statusDetail: state.detail,
    };
}

export function buildParticipantBankSetupView(input: {
    payer: BankSetupPayer | null;
    methods: readonly PaymentMethodRecord[];
    merchant: { readiness?: string | null; achReadiness?: string | null } | null;
}): ParticipantBankSetupView {
    const achAvailable = railCollectionAvailable(input.merchant, "ach");

    /*
     * A link minted with no recipient names no payer, and there is no honest way to guess one — the
     * household has more than one adult and a bank account belongs to exactly one of them.
     */
    let unavailableReason: string | null = null;
    if (!input.payer) {
        unavailableReason = "This link does not identify who is paying, so a bank account cannot be saved from it.";
    } else if (!achAvailable) {
        unavailableReason = "Your provider is not set up to take bank payments yet.";
    }

    return {
        payer: input.payer,
        canAddBankAccount: Boolean(input.payer) && achAvailable,
        unavailableReason,
        authorizationDisclosure: ACH_AUTHORIZATION_DISCLOSURE,
        savedMethods: input.payer ? input.methods.map(participantMethodView) : [],
    };
}
