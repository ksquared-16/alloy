/**
 * POS-FP16 — Configuration Discovery orchestrator (Layer 2 → Layer 5).
 *
 * Chains the versioned contracts: document structure → semantic model → business concepts →
 * configuration proposals → a categorized, operator-facing summary. Pure + deterministic; the
 * output is the `ConfigurationDiscoveryResult` the concept-first review renders and the operator
 * approves. No LLM, no I/O — a deterministic import never depends on a model call.
 */

import type { DocumentStructureCandidate } from "@/lib/pos/processingCase/structure/types";
import {
    DISCOVERY_CONTRACT_VERSION,
    type ConfigurationDiscoveryResult,
    type ConfigurationProposal,
    type DiscoveryCategory,
    type DiscoverySummaryCount,
} from "./contracts";
import { buildSemanticModel } from "./semanticModel";
import { discoverConcepts } from "./conceptDiscovery";
import { matchConcepts } from "./configurationMatching";

const CATEGORY_LABEL: Record<DiscoveryCategory, string> = {
    existing_fields: "Alloy already has",
    new_fields: "New durable fields",
    held_for_owner: "Handled by another area",
    safeguarding: "Safeguarding restrictions found",
    financial: "Payments",
    derived: "Handled automatically",
    needs_ownership_review: "Needs your decision",
    form_responses: "Families will provide",
    relationships: "Relationships found",
    upload_requirements: "Upload requirements found",
    acknowledgements: "Acknowledgements found",
    signatures: "Signatures found",
    static_content: "Static / legal sections found",
    collections: "Repeating structures found",
    output_copies: "Generated / output copies found",
    needs_review: "Items needing review",
};

const CATEGORY_ORDER: DiscoveryCategory[] = [
    "existing_fields",
    "new_fields",
    "held_for_owner",
    "safeguarding",
    "financial",
    "derived",
    "form_responses",
    "relationships",
    "upload_requirements",
    "acknowledgements",
    "signatures",
    "static_content",
    "output_copies",
    "collections",
    "needs_ownership_review",
    "needs_review",
];

/**
 * The ONE categorizer. Exported because the review UI used to keep a second copy of this switch,
 * and the copy fell behind: `financial_payment` and `derived_value_system` were added here and not
 * there, so those rows rendered correctly inside "All" while their own tabs read zero. A duplicated
 * taxonomy does not disagree loudly — it disagrees in the one place nobody is looking.
 */
export function categoryFor(p: ConfigurationProposal): DiscoveryCategory {
    switch (p.disposition) {
        case "reuse_canonical_field":
        case "reuse_existing_field":
            return "existing_fields";
        case "create_proposed_field":
            return "new_fields";
        case "held_for_canonical_owner":
            return "held_for_owner";
        case "form_only_response":
            return "form_responses";
        case "relationship_binding":
            return "relationships";
        case "safeguarding_binding":
            return "safeguarding";
        case "financial_payment":
            return "financial";
        case "derived_value_system":
            return "derived";
        case "held_unknown_owner":
            return "needs_ownership_review";
        case "upload_requirement":
            return "upload_requirements";
        case "acknowledgement":
            return "acknowledgements";
        case "signature_requirement":
            return "signatures";
        case "structured_collection":
            return "collections";
        case "static_content":
            return "static_content";
        case "output_binding":
            return "output_copies";
        default:
            return "needs_review";
    }
}

/** A proposal "needs review" when it is unresolved or low-confidence — it also counts in its home category. */
function needsReview(p: ConfigurationProposal): boolean {
    return p.disposition === "unresolved" || p.confidence.band === "attention" || p.confidence.band === "unresolved" || p.validation_issues.length > 0;
}

export function summarize(proposals: ConfigurationProposal[]): DiscoverySummaryCount[] {
    const counts = new Map<DiscoveryCategory, number>();
    for (const p of proposals) {
        const c = categoryFor(p);
        counts.set(c, (counts.get(c) ?? 0) + 1);
        if (c !== "needs_review" && needsReview(p)) counts.set("needs_review", (counts.get("needs_review") ?? 0) + 1);
    }
    return CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => ({ category: c, label: CATEGORY_LABEL[c], count: counts.get(c) ?? 0 }));
}

export interface DiscoverConfigurationInput {
    structure: DocumentStructureCandidate;
    sourceDocumentId?: string | null;
    /** Stamped by the store layer (kept out of the pure core to stay deterministic). */
    generatedAt?: string;
}

export function discoverConfiguration(input: DiscoverConfigurationInput): ConfigurationDiscoveryResult {
    const semantic = buildSemanticModel(input.structure);
    const concepts = discoverConcepts(semantic);
    const proposals = matchConcepts(concepts);
    return {
        contract_version: DISCOVERY_CONTRACT_VERSION,
        generated_at: input.generatedAt ?? "",
        source_document_id: input.sourceDocumentId ?? null,
        concepts,
        proposals,
        summary: summarize(proposals),
        warnings: semantic.warnings,
    };
}
