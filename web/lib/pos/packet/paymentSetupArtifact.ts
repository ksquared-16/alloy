/**
 * An artifact that is nothing but payment setup.
 *
 * The clause in the handbook was the obvious half of this obligation. The other half is a whole
 * artifact: the school's Direct Payment Authorization, whose boxes are Account Holder, Financial
 * Institution, Account Type, Routing number and Account number.
 *
 * Every one of those routes to `financial_payment` and creates no field — that part was already
 * right. But a Form is built from the SOURCE's destinations, not from its proposals, so realizing
 * this artifact would have put a routing-number box in front of a parent inside Alloy. The proposals
 * refused to store the number; the form still asked for it.
 *
 * The obligation is the same one: establish a way to be paid. Its owner is Financials/Payments, and
 * the family will authorize a method with the payment provider rather than typing an account number
 * into a school form. So the artifact defers with the clause instead of executing.
 *
 * Deliberately structural, and deliberately conservative. An artifact qualifies only when everything
 * it COLLECTS is payment setup. A registration page that happens to carry a tuition line is not a
 * payment artifact, and must keep executing.
 *
 * Pure + deterministic. No I/O.
 */

import type { ConfigurationProposal } from "@/lib/pos/discovery/contracts";

/** Concept kinds that put an input in front of a participant. Prose and signatures do not. */
const COLLECTING_KINDS = new Set(["scalar_field", "choice_field", "boolean_status", "value_series", "repeating_record"]);

/**
 * Dispositions that collect nothing FROM the family: Alloy fills them in, so their presence neither
 * makes an artifact a payment artifact nor rescues one from being it.
 */
const FILLED_BY_ALLOY = new Set(["derived_value_system", "output_binding"]);

export interface ArtifactConcept {
    id: string;
    kind: string;
    label: string;
    source?: { section_title?: string };
}

export interface PaymentSetupArtifactVerdict {
    isPaymentSetup: boolean;
    /** The collecting concepts that are payment setup — the evidence, for the record. */
    paymentConceptIds: string[];
    /** Collecting concepts that are NOT payment setup. Non-empty means the artifact keeps executing. */
    otherConceptIds: string[];
}

export function classifyPaymentSetupArtifact(
    artifact: { section_titles: readonly string[] },
    concepts: readonly ArtifactConcept[],
    proposals: readonly Pick<ConfigurationProposal, "candidate_id" | "disposition" | "ownership_routing">[],
): PaymentSetupArtifactVerdict {
    const byCandidate = new Map(proposals.map((p) => [p.candidate_id, p]));
    const mine = concepts.filter(
        (c) => c.source?.section_title && artifact.section_titles.includes(c.source.section_title),
    );

    const paymentConceptIds: string[] = [];
    const otherConceptIds: string[] = [];
    for (const c of mine) {
        if (!COLLECTING_KINDS.has(c.kind)) continue;
        const p = byCandidate.get(c.id);
        const d = p?.disposition;
        // A payment INSTRUMENT, not an amount. The tuition agreement carries a single material-fee
        // line and nothing else collectible; on a rule that only asked "is it financial" it was
        // held, and a signed agreement would have stopped executing.
        const instrument = p?.ownership_routing?.financialKind === "credential" || p?.ownership_routing?.financialKind === "method_setup";
        if (d === "financial_payment" && instrument) paymentConceptIds.push(c.id);
        else if (d === "financial_payment") continue;
        else if (d && FILLED_BY_ALLOY.has(d)) continue;
        else otherConceptIds.push(c.id);
    }

    return {
        // At least one, or an artifact that collects nothing at all would qualify by vacuity.
        isPaymentSetup: paymentConceptIds.length > 0 && otherConceptIds.length === 0,
        paymentConceptIds,
        otherConceptIds,
    };
}
