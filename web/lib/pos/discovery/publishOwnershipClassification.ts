/**
 * First-publish readiness: who owns every concept the packet would collect?
 *
 * The question this answers is narrow and blunt. If Alloy publishes this packet as a certification
 * Enrollment configuration, is there anything it would collect that NOTHING owns — no canonical
 * field, no relationship, no document, no named holder, not even an honest "this stays with the
 * process"? An ownerless concept is a question a parent answers into nowhere, and publishing one is
 * the dishonest outcome this classification exists to prevent.
 *
 * Note what is deliberately NOT counted as owned: a proposed-but-unapproved new field. The Field
 * System will own it once an operator approves creation; until then the packet would collect it
 * with no durable destination, so it is classified by what is true at publish time.
 *
 * Pure + deterministic. No I/O.
 */

import type { ConfigurationProposal } from "./contracts";
import { ownershipHoldFor } from "./canonicalOwnershipHolds";

export type PublishOwnership =
    | "CANONICAL"
    | "RELATIONSHIP"
    | "DOCUMENT"
    | "PROCESS_SCOPED_FOR_CERTIFICATION"
    | "HELD_PENDING_HEALTH"
    | "HELD_PENDING_CONSENT"
    | "HELD_PENDING_REQUIREMENT_EXCEPTION"
    | "ARTIFACT_SPECIFIC"
    | "FINANCIAL_PAYMENT_HELD"
    | "DERIVED_SYSTEM"
    | "HELD_UNKNOWN_OWNER"
    | "OWNERLESS";

export interface ClassifiedConcept {
    ownership: PublishOwnership;
    /** Why, in one clause — so a reader can disagree with the reasoning, not just the label. */
    basis: string;
}

/**
 * An acknowledgement or signature can still be *about* a held concept.
 *
 * The immunization exemption arrives as an acknowledgement plus a signature. Calling that
 * `ARTIFACT_SPECIFIC` would be true of its shape and misleading about its meaning — it is evidence
 * for a requirement exception that does not exist yet, and the certification record should say so.
 */
function heldLabelFor(label: string, conceptKey: string): PublishOwnership | null {
    const hold = ownershipHoldFor({ label, concept_key: conceptKey });
    if (!hold) return null;
    switch (hold.state) {
        case "AWAITING_HEALTH_FOUNDATION":
            return "HELD_PENDING_HEALTH";
        case "AWAITING_CANONICAL_CONSENT_OWNER":
            return "HELD_PENDING_CONSENT";
        case "AWAITING_REQUIREMENT_EXCEPTION_MODEL":
            return "HELD_PENDING_REQUIREMENT_EXCEPTION";
        default:
            return null;
    }
}

export function classifyForPublish(
    proposal: Pick<ConfigurationProposal, "disposition" | "ownership_hold" | "target_document_classification">,
    concept: { label: string; concept_key: string | null },
): ClassifiedConcept {
    const conceptKey = concept.concept_key ?? "";

    switch (proposal.disposition) {
        case "reuse_canonical_field":
        case "reuse_existing_field":
            return { ownership: "CANONICAL", basis: "binds to an existing canonical field" };

        case "safeguarding_binding":
            return { ownership: "CANONICAL", basis: "binds to the canonical safeguarding restriction owner" };

        case "relationship_binding":
            return { ownership: "RELATIONSHIP", basis: "collected as a person on a configured relationship" };

        case "upload_requirement":
            return {
                ownership: "DOCUMENT",
                basis: proposal.target_document_classification
                    ? `a document requirement typed as ${proposal.target_document_classification}`
                    : "a document requirement Alloy has no type name for — the requirement is owned, the type is not",
            };

        case "held_for_canonical_owner": {
            const state = proposal.ownership_hold?.state;
            if (state === "AWAITING_HEALTH_FOUNDATION") return { ownership: "HELD_PENDING_HEALTH", basis: "a Health foundation kind" };
            if (state === "AWAITING_CANONICAL_CONSENT_OWNER") return { ownership: "HELD_PENDING_CONSENT", basis: "a consent record" };
            if (state === "AWAITING_REQUIREMENT_EXCEPTION_MODEL")
                return { ownership: "HELD_PENDING_REQUIREMENT_EXCEPTION", basis: "a requirement exception" };
            // A hold with no named holder is precisely what "ownerless" means.
            return { ownership: "OWNERLESS", basis: `held with no named owner (${state ?? "unknown state"})` };
        }

        case "acknowledgement":
        case "signature_requirement": {
            const held = heldLabelFor(concept.label, conceptKey);
            if (held) return { ownership: held, basis: "evidence for a concept whose owner is still being built" };
            return { ownership: "ARTIFACT_SPECIFIC", basis: "a signature or acknowledgement belongs to the artifact that carries it" };
        }

        case "static_content":
        case "output_binding":
        case "derived_value":
            return { ownership: "ARTIFACT_SPECIFIC", basis: "content of the artifact, not a collected fact" };

        case "financial_payment":
            return {
                ownership: "FINANCIAL_PAYMENT_HELD",
                basis: "a payment credential, setup detail or billing amount — Financials owns it and Alloy stores no field for it",
            };

        case "derived_value_system":
            return {
                ownership: "DERIVED_SYSTEM",
                basis: "Alloy computes this from canonical truth or from the execution; storing it would create a second answer",
            };

        case "held_unknown_owner":
            // NOT ownerless. Ownerless means nothing accounts for it; this is accounted for
            // explicitly as "no owner has been decided", which is a state a person can act on.
            return {
                ownership: "HELD_UNKNOWN_OWNER",
                basis: "collected on the form and kept with the process while ownership is undecided — never asserted as durable truth",
            };

        case "form_only_response":
            return { ownership: "PROCESS_SCOPED_FOR_CERTIFICATION", basis: "collected on the form; no durable record claims it" };

        case "structured_collection":
            return {
                ownership: "PROCESS_SCOPED_FOR_CERTIFICATION",
                basis: "recognised as one collection; where it lives is still an operator decision",
            };

        case "create_proposed_field":
            // Honest at publish time: the Field System owns it only AFTER an operator approves
            // creation. Counting an unapproved proposal as canonical is how a publish comes to imply
            // durable behaviour it does not have.
            //
            // After Slice 7 this branch should be unreachable for the real packet — a new field is
            // now an affirmative ownership conclusion, and every durable fact this packet asks for
            // already had a destination. The branch stays because reachability is a property of the
            // corpus, not of the code.
            return {
                ownership: "PROCESS_SCOPED_FOR_CERTIFICATION",
                basis: "a new field is proposed but not approved, so nothing durable holds it yet",
            };

        case "unresolved":
            return { ownership: "OWNERLESS", basis: "no disposition was reached" };

        default:
            return { ownership: "OWNERLESS", basis: "unclassified disposition" };
    }
}

/** The publish gate: a packet must collect nothing that nothing owns. */
export function ownerlessCount(classified: readonly ClassifiedConcept[]): number {
    return classified.filter((c) => c.ownership === "OWNERLESS").length;
}
