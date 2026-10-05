/**
 * ── WHERE A CHARGE CAME FROM, BOUNDED BY WHAT IS ACTUALLY STORED ──────────────────────────────
 *
 * Censused on deployed staging before this existed (gar_bca766cd079e8b, gar_fcef701a4e7f5d):
 *
 *   · `job_id`, `schedule_id` and `subscription_id` are set on ZERO of 125 rows. They exist and
 *     nothing writes them.
 *   · the only origin evidence carrying anything is `metadata->>'source'`, with four values:
 *     charge_template (65), manual_reduction (44), financial_reduction (7), null (9).
 *   · every one of the 18 charges with no human actor is `source = charge_template`, carries a
 *     `charge_template_id`, and has no job, no schedule, no subscription and no source charge.
 *
 * So the strongest truthful statement about an actorless charge today is that it was RAISED FROM A
 * CHARGE TEMPLATE. "Scheduled billing" would be an invention: no stored field distinguishes a
 * scheduled run from any other template-raised charge, and `created_by = null` is the absence of a
 * person, not the presence of a scheduler.
 *
 * The branches for a billing run and a correction are kept because they are evidence-bound and
 * correct the moment anything writes those columns — they are not speculation, they are the rule
 * applied to fields that exist. Today they are simply unreached.
 */

/** Exactly the stored fields that can speak to origin. Nothing derived, nothing inferred. */
export type ChargeOriginEvidence = {
    createdBy: string | null;
    jobId: string | null;
    sourceChargeId: string | null;
    chargeTemplateId: string | null;
    /** `metadata->>'source'`, the only populated origin marker on this tenant. */
    metadataSource: string | null;
};

export type ChargeOrigin =
    /** A person did this. The strongest evidence there is: an actor is recorded. */
    | { kind: "person"; actorUserId: string }
    /** A billing run did it, proven by the job it belongs to. */
    | { kind: "billing_run"; jobId: string }
    /** It exists to correct another charge, and names which. */
    | { kind: "correction"; sourceChargeId: string }
    /** Raised from a configured template. Which template, where that is recorded. */
    | { kind: "charge_template"; chargeTemplateId: string | null }
    /** Something created it and nothing recorded what. The weakest truthful answer. */
    | { kind: "automatic" };

/**
 * PRECEDENCE IS BY STRENGTH OF EVIDENCE, NOT BY CONVENIENCE.
 *
 * A recorded actor wins outright: a human correction is still a human's charge, and
 * `sourceChargeId` describes what it RELATES to rather than what raised it — which is why the
 * caller carries that relationship separately and this only falls back to it when no actor exists.
 */
export function classifyChargeOrigin(evidence: ChargeOriginEvidence): ChargeOrigin {
    if (evidence.createdBy) return { kind: "person", actorUserId: evidence.createdBy };
    if (evidence.jobId) return { kind: "billing_run", jobId: evidence.jobId };
    if (evidence.sourceChargeId) return { kind: "correction", sourceChargeId: evidence.sourceChargeId };
    if (evidence.metadataSource === "charge_template" || evidence.chargeTemplateId) {
        return { kind: "charge_template", chargeTemplateId: evidence.chargeTemplateId };
    }
    return { kind: "automatic" };
}

/**
 * The operator's sentence for an origin.
 *
 * `actorName` is the canonical identity's answer and `null` is one of its real answers — see
 * `operatorAccountName`: "an unknown name is unknown", and a surface says so rather than printing
 * an address or an id in a person's place.
 */
export function describeChargeOrigin(origin: ChargeOrigin, actorName: string | null): string {
    switch (origin.kind) {
        case "person":
            /*
             * ── THE UNNAMED SENTENCE, AFTER W7-F002 ──
             *
             * It used to read "Created by a person whose name is not on file", which told a reader
             * that something was absent and nothing about WHAT was absent or whose job it was to
             * supply it — on a financial audit line, where the whole point is saying who did this.
             * The Director's decision is explicit: a product must not accept that as normal
             * financial attribution.
             *
             * So the sentence now names the unmet requirement rather than the symptom, and
             * `financialActorIdentityGap` supplies the actionable half beside it. A recorded actor
             * is still a recorded actor — `created_by` is durable and unchanged — which is why this
             * says the ledger cannot NAME them rather than implying nobody is recorded.
             */
            return actorName ? `Created by ${actorName}` : "Created by an operator the ledger cannot name";
        case "billing_run":
            return "Raised by a billing run";
        case "correction":
            return "Raised to correct another charge";
        case "charge_template":
            return "Raised from a charge template";
        case "automatic":
            /*
             * Deliberately the weakest sentence available. Everything stronger — "Scheduled
             * billing", "Imported", a named system — would assert a mechanism no stored field
             * proves.
             */
            return "Created automatically";
    }
}
