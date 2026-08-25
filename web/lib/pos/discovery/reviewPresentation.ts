/**
 * How the review READS, derived entirely from what the review already concluded.
 *
 * The reasoning got good and the screen kept showing the reasoning: eighty-four rows of audit prose,
 * each explaining itself at paragraph length, defaulting to everything at once. An operator opening
 * that page cannot tell in five seconds what Alloy handled, what needs them, or whether anything
 * blocks the publish — which is the only question they came to answer.
 *
 * So this module turns settled conclusions into short sentences. It creates no truth: every function
 * here is a projection of `disposition`, `ownership_routing` and the existing targets. If a row's
 * copy is wrong, the conclusion behind it is wrong, and that is the right place to fix it.
 *
 * Pure + deterministic. No I/O.
 */

import type { ConfigurationProposal, DiscoveryCategory, ProposalDecisionState } from "./contracts";
import { isBulkAcceptSafe } from "./bulkAcceptSafety";

// ─────────────────────────────────────────────────────────────────────────────
// Sections — the settled vocabulary, not a second taxonomy.
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewSectionKey =
    | "needs_review"
    | "existing_data"
    | "relationships"
    | "safeguarding"
    | "health_held"
    | "financials"
    | "derived"
    | "form_responses"
    | "acknowledgements"
    | "signatures"
    | "all";

export interface ReviewSection {
    key: ReviewSectionKey;
    label: string;
    /** Discovery categories that land here. `needs_review` and `all` are computed, not category-based. */
    categories?: readonly DiscoveryCategory[];
}

/**
 * Ordered by what the operator is here to do. `needs_review` is first and is the default view —
 * everything after it is inspection.
 */
export const REVIEW_SECTIONS: readonly ReviewSection[] = [
    { key: "needs_review", label: "Needs review" },
    { key: "existing_data", label: "Existing data", categories: ["existing_fields", "new_fields", "collections"] },
    { key: "relationships", label: "Relationships", categories: ["relationships"] },
    { key: "safeguarding", label: "Safeguarding", categories: ["safeguarding"] },
    { key: "health_held", label: "Health / held", categories: ["held_for_owner"] },
    { key: "financials", label: "Financials", categories: ["financial"] },
    { key: "derived", label: "Derived by Alloy", categories: ["derived"] },
    { key: "form_responses", label: "Form responses", categories: ["form_responses", "static_content", "output_copies"] },
    { key: "acknowledgements", label: "Acknowledgements", categories: ["acknowledgements", "upload_requirements"] },
    { key: "signatures", label: "Signatures", categories: ["signatures"] },
    { key: "all", label: "All" },
];

/**
 * Does this row need a person?
 *
 * Two things qualify, and they are different: Alloy did not reach a conclusion (undecided ownership,
 * unresolved, a validation issue), or Alloy DID reach one that a person must ratify because acting on
 * it wrongly is a safety failure (a safeguarding restriction).
 *
 * Everything else — a binding, a derived value, a held concept with a named owner, an obligation — is
 * a conclusion the operator can inspect rather than make.
 */
export function needsOperatorReview(p: Pick<ConfigurationProposal,
    "disposition" | "confidence" | "validation_issues" | "ownership_routing" | "refused_binding">): boolean {
    if (p.disposition === "held_unknown_owner" || p.disposition === "unresolved") return true;
    if (p.disposition === "safeguarding_binding") return true;
    if (p.disposition === "create_proposed_field") return true;
    if (p.validation_issues.length > 0) return true;
    if (p.refused_binding) return true;
    return false;
}

export function sectionFor(p: ConfigurationProposal, category: DiscoveryCategory): ReviewSectionKey[] {
    const keys: ReviewSectionKey[] = ["all"];
    if (needsOperatorReview(p)) keys.push("needs_review");
    for (const s of REVIEW_SECTIONS) {
        if (!s.categories) continue;
        if (s.categories.includes(category)) keys.push(s.key);
    }
    return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row copy — the ownership line and its one consequence.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConciseRow {
    /** Where the answer goes, as a short breadcrumb. One line. */
    ownership: string;
    /** What that means for this school, in one sentence. */
    consequence: string;
}

const OWNER_LINE: Partial<Record<ConfigurationProposal["disposition"], string>> = {
    relationship_binding: "Relationship",
    safeguarding_binding: "Safeguarding · Restriction",
    financial_payment: "Financials · Payment setup",
    derived_value_system: "Derived by Alloy",
    held_unknown_owner: "Needs an owner",
    form_only_response: "This form only",
    acknowledgement: "Requirement · Acknowledgement",
    signature_requirement: "Requirement · Signature",
    upload_requirement: "Requirement · Document",
    static_content: "Static content",
    output_binding: "Generated copy",
    structured_collection: "Repeating structure",
    unresolved: "Needs classification",
};

export function conciseRow(p: ConfigurationProposal): ConciseRow {
    switch (p.disposition) {
        case "reuse_canonical_field":
        case "reuse_existing_field": {
            const t = p.target_field_source;
            return {
                ownership: t ? `${humanEntity(t.entity_type)} · ${humanKey(t.field_key)}` : "Existing data",
                consequence: "Uses the existing canonical value.",
            };
        }

        case "create_proposed_field":
            return {
                ownership: `New field · ${humanEntity(p.proposed_field?.entity_type ?? "")}`,
                consequence: "Creates durable truth. Nothing is created until you confirm.",
            };

        case "relationship_binding":
            return {
                ownership: p.target_relationship_role ? `Relationship · ${humanKey(p.target_relationship_role)}` : "Relationship",
                consequence: "Links or creates a person. Not stored as a field on the child.",
            };

        case "safeguarding_binding":
            return {
                ownership: OWNER_LINE.safeguarding_binding!,
                consequence: "Creates a reviewable restriction with evidence. Nothing becomes active until approved.",
            };

        case "financial_payment":
            return financialRow(p);

        case "derived_value_system": {
            const from = p.ownership_routing?.derivedFrom;
            if (!from) return { ownership: OWNER_LINE.derived_value_system!, consequence: "Alloy already knows this. No field needed." };
            // "Calculated from when the form was submitted" is not a sentence a person would say.
            // A value that IS the execution is recorded; a value computed from records is calculated.
            const recorded = from.startsWith("when ");
            return {
                ownership: OWNER_LINE.derived_value_system!,
                consequence: recorded ? `Recorded ${from}. No field needed.` : `Calculated from ${from}. No field needed.`,
            };
        }

        case "held_for_canonical_owner": {
            const state = p.ownership_hold?.state;
            if (state === "AWAITING_CANONICAL_CONSENT_OWNER") {
                return { ownership: "Consent · Held", consequence: "Collected for this enrollment; the consent record lands with Consent." };
            }
            if (state === "AWAITING_REQUIREMENT_EXCEPTION_MODEL") {
                return { ownership: "Requirement exception · Held", consequence: "Collected as evidence; exceptions land with Business Process." };
            }
            return { ownership: "Health · Held", consequence: "Collected for this enrollment; durable health ownership lands in the Health foundation." };
        }

        case "held_unknown_owner":
            return { ownership: OWNER_LINE.held_unknown_owner!, consequence: whyStopped(p) };

        case "form_only_response":
            return { ownership: OWNER_LINE.form_only_response!, consequence: "Kept with this enrollment. No record is updated." };

        case "acknowledgement":
            return { ownership: OWNER_LINE.acknowledgement!, consequence: "Every guardian must acknowledge it." };

        case "signature_requirement":
            return { ownership: OWNER_LINE.signature_requirement!, consequence: "Every guardian must sign it." };

        case "upload_requirement":
            return {
                ownership: p.target_document_classification
                    ? `Requirement · ${humanKey(p.target_document_classification)}`
                    : OWNER_LINE.upload_requirement!,
                consequence: p.target_document_classification
                    ? "An uploaded file is recognised as this document type."
                    : "A document is required. Alloy has no type name for it yet.",
            };

        case "structured_collection":
            return { ownership: OWNER_LINE.structured_collection!, consequence: "Reviewed once as a set, not as separate questions." };

        case "static_content":
            return { ownership: OWNER_LINE.static_content!, consequence: "Shown to the family. Nothing is collected." };

        case "output_binding":
            return { ownership: OWNER_LINE.output_binding!, consequence: "Filled in from answers already given." };

        default:
            return { ownership: OWNER_LINE[p.disposition] ?? "Needs classification", consequence: "Needs a decision before this can be used." };
    }
}

/**
 * Financials holds values for three different reasons, and calling all three "Payment setup" is the
 * kind of near-enough label that makes an operator distrust the whole screen — a school's annual fee
 * is not payment setup, and a routing number is not a fee.
 */
function financialRow(p: ConfigurationProposal): ConciseRow {
    const basis = p.ownership_routing?.basis ?? "";
    if (/routing or account number|protected/i.test(basis)) {
        return {
            ownership: "Financials · Bank credential",
            consequence: "Sent directly to the payment provider. Not stored as an Alloy field.",
        };
    }
    if (/billing configuration/i.test(basis)) {
        return {
            ownership: "Financials · Billing",
            consequence: "An amount the school sets. Owned by your rate plans, not by this family.",
        };
    }
    return {
        ownership: "Financials · Payment setup",
        consequence: "Needed while payment is set up. Not kept as an Alloy field.",
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Why Alloy stopped — a few words, so twenty rows can be scanned for sameness.
// ─────────────────────────────────────────────────────────────────────────────

export function whyStopped(p: ConfigurationProposal): string {
    if (p.refused_binding) return "A canonical field matched and was refused — it belongs to someone else.";
    if (p.validation_issues.length > 0) return p.validation_issues[0]!;
    if (p.ownership_routing?.blockedOn === "TIME_ADOPTION") return "Unsupported type — a time of day.";
    switch (p.disposition) {
        case "safeguarding_binding":
            return "Sensitive restriction — needs approval.";
        case "create_proposed_field":
            return "Would create durable truth.";
        case "unresolved":
            return "No disposition reached.";
        default:
            return "Owner undecided — durable ownership not settled.";
    }
}

/**
 * The short reason chip, so similar decisions look similar at a glance.
 *
 * Repeating one paragraph twenty times is what made the section unreadable: every row said the same
 * thing at length, so none of them said anything.
 */
export function stopReasonChip(p: ConfigurationProposal): string {
    if (p.refused_binding) return "Ambiguous grain";
    if (p.ownership_routing?.blockedOn === "TIME_ADOPTION") return "Unsupported type";
    if (p.validation_issues.length > 0) return "Incomplete";
    switch (p.disposition) {
        case "safeguarding_binding":
            return "Sensitive restriction";
        case "create_proposed_field":
            return "New durable truth";
        case "unresolved":
            return "Unclassified";
        default:
            return "Owner undecided";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions — one verb, an outcome beside it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What accepting THIS row does.
 *
 * "Accept" means materially different things across categories, and a different button per category
 * would be a zoo. One consistent verb with the outcome named next to it says more and adds nothing.
 */
export function acceptOutcome(p: ConfigurationProposal): string {
    switch (p.disposition) {
        case "reuse_canonical_field":
        case "reuse_existing_field":
            return "use the existing field";
        case "create_proposed_field":
            return "create a new field";
        case "relationship_binding":
            return "link as a relationship";
        case "safeguarding_binding":
            return "propose the restriction";
        case "financial_payment":
            return "leave it with Financials";
        case "derived_value_system":
            return "let Alloy derive it";
        case "held_for_canonical_owner":
        case "held_unknown_owner":
            return "keep it with this enrollment";
        case "form_only_response":
            return "keep it on the form";
        case "acknowledgement":
            return "require an acknowledgement";
        case "signature_requirement":
            return "require a signature";
        case "upload_requirement":
            return "require a document";
        default:
            return "confirm";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// The two headline groups.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessSummary {
    /** Conclusions the operator inspects rather than makes. */
    handled: number;
    /** Rows still awaiting a person. */
    needsReview: number;
    /** Of those, how many can be accepted with no modelling judgement at all. */
    bulkSafe: number;
    /** Nothing here blocks publication; this reports whether anything does. */
    blocking: number;
}

export function readinessSummary(
    proposals: readonly ConfigurationProposal[],
    decisions: Record<string, ProposalDecisionState>,
): ReadinessSummary {
    let handled = 0;
    let needsReview = 0;
    let bulkSafe = 0;
    let blocking = 0;
    for (const p of proposals) {
        const pending = (decisions[p.id] ?? p.decision_state) === "proposed";
        if (needsOperatorReview(p) && pending) {
            needsReview++;
            // Unclassified is the only state that would publish a question with nothing behind it.
            if (p.disposition === "unresolved") blocking++;
        } else {
            handled++;
        }
        if (pending && isBulkAcceptSafe(p)) bulkSafe++;
    }
    return { handled, needsReview, bulkSafe, blocking };
}

// ─────────────────────────────────────────────────────────────────────────────

function humanEntity(entityType: string): string {
    if (entityType === "customer_member") return "Child";
    if (entityType === "customer") return "Household";
    if (entityType === "enrollment") return "Enrollment";
    return entityType ? entityType[0]!.toUpperCase() + entityType.slice(1).replace(/_/g, " ") : "";
}

function humanKey(key: string): string {
    const s = key.replace(/_/g, " ").trim();
    return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
