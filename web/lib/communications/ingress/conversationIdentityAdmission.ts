/**
 * The one refusal this runtime enforces — and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------
 *
 * Live certification produced it exactly: a Google Calendar invitation from
 * `christina@intentlyco.com`, a stranger with no Person, no relationship and no Alloy
 * ancestry, arrived through blanket forwarding at a mixed human identity and became a
 * permanent canonical Communications message — `unknown_sender`, a conversation with
 * nobody, and unread family work for an operator who has no business with it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE REASON CODE AND NOT "THE GATE"
 * ---------------------------------------------------------------------------
 *
 * The deterministic gate classifies every message across four lanes. Enforcing all of it
 * would be indefensible on the evidence: Lane B's general enforcement is unproven (the
 * historical corpus could not test it — no message carried an authentication result), and
 * Lanes C and D have never been measured at all because no purpose or acquisition identity
 * exists anywhere yet.
 *
 * So enforcement is scoped to the single class the corpus actually measured and the single
 * class that produced the defect: **REJECT_NO_ADMITTING_EVIDENCE at a `conversation`
 * identity.** 33 of 65 real messages fell in it. Every other outcome — every admission,
 * every review, and every other refusal — behaves exactly as it does today.
 *
 * What that deliberately does NOT enforce:
 *
 *   · `REJECT_RELATIONSHIP_NOT_WATCHED` — staff, vendor, agency mail keeps arriving. That
 *     is Lane B territory and Lane B is not proven.
 *   · `REJECT_RELATIONSHIP_INACTIVE` — a former family's mail keeps arriving.
 *   · anything at a `purpose` or `acquisition` identity — unknown senders are the POINT
 *     there, and those lanes admit long before this rule is consulted.
 *   · shared endpoints — those are review, and review is never a refusal. An address two
 *     Persons hold is never guessed and never dropped.
 *
 * ---------------------------------------------------------------------------
 * THE MEASURED COST, STATED RATHER THAN GLOSSED
 * ---------------------------------------------------------------------------
 *
 * In the 65-message corpus this class contained the three messages the organization later
 * replied to. Enforcing it would have refused those three. They are recoverable — refusal
 * quarantines the provider receipt rather than destroying it — and the candidate rule that
 * would have rescued them was measured and proven unusable: engagement arrives AFTER the
 * message, and a gate runs at arrival.
 *
 * So the honest characterisation is roughly one in eleven refusals in this class may want a
 * human look, none of them are lost, and the alternative is every stranger's calendar
 * invitation becoming permanent family history.
 *
 * ---------------------------------------------------------------------------
 * FAIL OPEN WHEN THE MODEL CANNOT ANSWER
 * ---------------------------------------------------------------------------
 *
 * Identity roles are what separate `kelly@school.com` from `enrollment@school.com`. Where
 * that column is not deployed, this refuses NOTHING: guessing every identity is a
 * conversation would start refusing acquisition mail, which is a worse defect than the one
 * being fixed. Absence of role data disables enforcement rather than widening it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    evaluateEmailIngressEligibility,
    type EmailIngressDecision,
    type EmailIngressEnvelope,
} from "@/lib/communications/ingress/emailIngressEligibility";
import {
    loadIngressIdentities,
    loadSenderRelationships,
    resolveWatchedRelationshipKinds,
} from "@/lib/communications/ingress/observeEmailIngressEligibility";

/** The disposition an enforced refusal writes onto the provider receipt. */
export const INELIGIBLE_DISPOSITION = "ineligible_unrecognized_sender";

/**
 * Is this decision the one class this runtime refuses?
 *
 * Pure, and deliberately narrow enough to read in one breath: an unrecognised sender, at a
 * general human identity, with no Alloy conversation behind them.
 */
export function isUnrecognizedSenderAtConversationIdentity(decision: EmailIngressDecision): boolean {
    return (
        decision.disposition === "WOULD_REJECT" &&
        decision.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE" &&
        decision.identity?.role === "conversation"
    );
}

export type ConversationIdentityAdmission =
    /** Persist as normal. Every lane, every review, every other refusal. */
    | { refuse: false; decision: EmailIngressDecision | null; reason: string }
    /** Quarantine at the receipt. No canonical message, no thread, no unread work. */
    | { refuse: true; decision: EmailIngressDecision; reasonCode: string };

/**
 * Decide whether this message may become canonical Communications history.
 *
 * Never throws. An evaluation that cannot complete — missing role data, an unavailable
 * table, any error at all — returns `refuse: false`, because the only safe direction for a
 * failure here is the behaviour that shipped before this rule existed.
 */
export async function evaluateConversationIdentityAdmission(
    deps: { supabase: SupabaseClient; now?: () => string },
    input: { orgId: string; envelope: EmailIngressEnvelope; resolvedAlloyThreadId: string | null },
): Promise<ConversationIdentityAdmission> {
    try {
        const [{ identities }, watchedRelationshipKinds] = await Promise.all([
            loadIngressIdentities(deps, input.orgId),
            resolveWatchedRelationshipKinds(deps, input.orgId),
        ]);

        // No identity resolved a role means the role column is absent or the binding is not
        // loadable. Enforcing on a guess is exactly what the header forbids.
        if (identities.length === 0) {
            return { refuse: false, decision: null, reason: "no_identity_roles_available" };
        }

        const { personIds, relationships } = await loadSenderRelationships(
            deps,
            input.orgId,
            input.envelope.sender,
        );

        const decision = evaluateEmailIngressEligibility({
            envelope: input.envelope,
            policy: { orgId: input.orgId, identities, watchedRelationshipKinds },
            senderRelationships: relationships,
            senderPersonIds: personIds,
            resolvedAlloyThreadId: input.resolvedAlloyThreadId,
        });

        if (isUnrecognizedSenderAtConversationIdentity(decision)) {
            return { refuse: true, decision, reasonCode: decision.reasonCode };
        }
        return { refuse: false, decision, reason: decision.reasonCode };
    } catch {
        // Fail open, deliberately and silently. A refusal that happens because a query
        // failed is indistinguishable to an operator from mail that never arrived.
        return { refuse: false, decision: null, reason: "admission_evaluation_unavailable" };
    }
}
