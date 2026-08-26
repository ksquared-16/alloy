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
    | "families_provide"
    | "already_have"
    | "automatic"
    | "documents_signatures"
    | "all";

export interface ReviewSection {
    key: ReviewSectionKey;
    label: string;
    /** One line under the heading, so the grouping explains itself. */
    blurb: string;
    categories?: readonly DiscoveryCategory[];
}

/**
 * The operator's five questions, in the order they matter.
 *
 * These replace a grouping that named DURABLE OWNERSHIP — "Owned elsewhere in Alloy", "Needs an
 * owner". That was true and it read as exclusion: medications appeared under "held", which looks
 * exactly like "this will not be asked". It will be asked. Enrollment collects it, the parent
 * answers it, and Health becomes the durable owner later — collection and ownership are different
 * questions, and only one of them is what an operator is deciding on this screen.
 *
 * So the primary grouping answers "what happens to this family", and where the answer eventually
 * lives moved to Why. Nothing about routing changed; this is the same conclusions, said usefully.
 */
export const REVIEW_SECTIONS: readonly ReviewSection[] = [
    {
        key: "needs_review",
        label: "Needs your review",
        blurb: "Decisions only you can make.",
    },
    {
        key: "families_provide",
        label: "Families will provide",
        blurb: "Questions this enrollment asks. Where each answer finally lives is in Why.",
        categories: ["form_responses", "held_for_owner", "financial", "relationships", "collections"],
    },
    {
        key: "already_have",
        label: "Alloy already has",
        blurb: "Existing records this enrollment confirms or prefills.",
        categories: ["existing_fields"],
    },
    {
        key: "automatic",
        label: "Handled automatically",
        blurb: "Alloy fills these in. No question is asked.",
        categories: ["derived"],
    },
    {
        key: "documents_signatures",
        label: "Documents & signatures",
        blurb: "Obligations executed through artifacts.",
        categories: ["acknowledgements", "signatures", "upload_requirements", "static_content", "output_copies"],
    },
    { key: "all", label: "All", blurb: "Every concept, with full detail." },
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
/**
 * Obligations that become executable requirements. One of these must be decided by SOMEBODY.
 *
 * The hole this closes: a clause-level upload at `review` confidence was neither bulk-safe nor
 * claimed here, so nobody could approve it and it silently never executed — four document
 * requirements that the review reported finding and the packet never asked for.
 */
const EXECUTABLE_OBLIGATIONS = new Set(["upload_requirement", "acknowledgement", "signature_requirement"]);

export function needsOperatorReview(p: Pick<ConfigurationProposal,
    "disposition" | "confidence" | "validation_issues" | "ownership_routing" | "refused_binding">): boolean {
    if (p.disposition === "held_unknown_owner" || p.disposition === "unresolved") return true;
    // An obligation that cannot be auto-accepted must be someone's decision. Conclusions the
    // operator only inspects — held, derived, financial, reuse — are deliberately not swept in.
    if (EXECUTABLE_OBLIGATIONS.has(p.disposition) && !isBulkAcceptSafe(p)) return true;
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
    // A concept the operator must decide is STILL something the family will be asked. Undecided
    // ownership does not remove the question from the packet, and grouping it only under a decision
    // would hide it from the one list that answers "what will this family see".
    if (needsOperatorReview(p) && !keys.includes("families_provide") && p.disposition !== "create_proposed_field") {
        keys.push("families_provide");
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
                ownership: t ? `Alloy already has · ${humanKey(t.field_key)}` : "Alloy already has this",
                consequence: "Confirmed or prefilled from the record Alloy already keeps.",
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
                consequence: "Asked during enrollment, then linked as a person rather than a field.",
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
                ownership: "Handled automatically",
                consequence: recorded
                    ? `Alloy records this ${from}. No question needed.`
                    : `Alloy works this out from ${from}. No question needed.`,
            };
        }

        case "held_for_canonical_owner": {
            // Never "held". A family IS asked these; what is unsettled is where the answer finally
            // lives, and that belongs in Why. "Held" read as "will not be collected", which for
            // medications is both false and the most alarming thing the screen could imply.
            const state = p.ownership_hold?.state;
            if (state === "AWAITING_CANONICAL_CONSENT_OWNER") {
                return { ownership: "Families provide", consequence: "Asked during enrollment. Consent keeps the record of what was granted." };
            }
            if (state === "AWAITING_REQUIREMENT_EXCEPTION_MODEL") {
                return { ownership: "Families provide", consequence: "Asked during enrollment, and kept as evidence for the exception." };
            }
            return { ownership: "Families provide", consequence: "Asked during enrollment. Health & Safety keeps the ongoing record." };
        }

        case "held_unknown_owner":
            // Asked either way. The decision is where it should live, not whether to ask.
            return { ownership: "Needs your decision", consequence: `Asked during enrollment. ${whyStopped(p)}` };

        case "form_only_response":
            return { ownership: "Families provide", consequence: "Asked during enrollment. The answer stays with this enrollment." };

        case "acknowledgement":
            return { ownership: OWNER_LINE.acknowledgement!, consequence: "Every guardian acknowledges this during enrollment." };

        case "signature_requirement":
            return { ownership: OWNER_LINE.signature_requirement!, consequence: "Every guardian signs this during enrollment." };

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
            ownership: "Families provide",
            consequence: "Asked during enrollment and sent straight to your payment provider. Alloy never stores it.",
        };
    }
    if (/billing configuration/i.test(basis)) {
        return {
            ownership: "Handled automatically",
            consequence: "An amount your school sets. Comes from your rate plans, so no one is asked.",
        };
    }
    return {
        ownership: "Families provide",
        consequence: "Asked while payment is set up. Your payment provider keeps it, not Alloy.",
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
