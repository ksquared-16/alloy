/**
 * The importer's first pass: apply what discovery is SURE of, at detection, so the form an operator
 * opens is already the form the paperwork meant — and leave everything else as a proposal.
 *
 * Discovery always understood more than the default form view used. Repeated contact rows were a
 * relationship collection, "Child's Name" was the child's canonical name, the acknowledgements and
 * the signature were requirements — but all of it waited behind a concept review the form view never
 * linked to, so an operator rebuilt by hand what Alloy had already worked out.
 *
 * "Sure" is not a new policy. It is `isBulkAcceptSafe` — the rule the review's own "accept all
 * high-confidence" button uses: a confident matcher AND an ownership conclusion no person needs to
 * read. Two guards are added because applying is not the same as accepting a row on screen:
 *
 *  - REPEATED PRINTED ROWS. A field binding is applied only when exactly one question carries the
 *    concept. Paper that prints "Child's Name" twice is asking about two children; binding both
 *    lines to one child's name would silently write the second child over the first.
 *  - A WHOLE NAME. A single "Guardian's Name" line is not a first name. Binding it to `first_name`
 *    stores "Jane Smith" as a first name; the Studio's own name composition (First | Last) is the
 *    operator's one click, so the line is left for it.
 *  - ALREADY MAPPED. A question the resolver settled keeps its destination; initialization fills
 *    blanks, it does not re-decide them.
 *
 * Only structural dispositions are applied: canonical field reuse and relationship collections. The
 * rest of the safe set (acknowledgements, signatures, static content) is already carried into the
 * form by section disposition, so applying it would change nothing but the ledger.
 *
 * Pure + deterministic. The caller persists the draft and the ledger.
 */

import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { suggestsNameComposition } from "@/lib/forms/formBuilderSchema";
import { applyDiscovery, draftFieldsForConcept, type ApplicationResult } from "./applyDiscovery";
import { isBulkAcceptSafe } from "./bulkAcceptSafety";
import type { ConfigurationProposal, ProposalDecisionState } from "./contracts";

/** Where an application ledger lives on the case — shared with the operator's Apply route. */
export const DISCOVERY_APPLICATION_METADATA_KEY = "configuration_discovery_application";

const INITIALIZED_DISPOSITIONS = new Set<ConfigurationProposal["disposition"]>([
    "reuse_canonical_field",
    "reuse_existing_field",
    "relationship_binding",
]);

const NAME_PART_KEY = /(^|_)(first|last)_name$/;

export type StrongUnderstandingSkip = { proposal_id: string; reason: "repeated_rows" | "whole_name" | "already_mapped" };

export interface StrongUnderstandingResult {
    draft: StoredFormDraftPreview;
    application: ApplicationResult | null;
    /** Safe proposals deliberately left for the operator, and why. */
    skipped: StrongUnderstandingSkip[];
}

export function initializeStrongUnderstanding(input: StoredFormDraftPreview): StrongUnderstandingResult {
    const discovery = input.configuration_discovery;
    if (!discovery?.proposals?.length) return { draft: input, application: null, skipped: [] };

    const decisions: Record<string, ProposalDecisionState> = {};
    const skipped: StrongUnderstandingSkip[] = [];
    for (const p of discovery.proposals) {
        if (p.decision_state !== "proposed") continue;
        if (!INITIALIZED_DISPOSITIONS.has(p.disposition) || !isBulkAcceptSafe(p)) continue;
        if (p.disposition !== "relationship_binding") {
            const fields = draftFieldsForConcept(input, discovery, p.candidate_id);
            if (fields.length !== 1) {
                skipped.push({ proposal_id: p.id, reason: "repeated_rows" });
                continue;
            }
            // The resolver already settled this question. Re-binding it to the same fact in the
            // other key vocabulary (child_date_of_birth vs dob) is churn, not understanding.
            if (fields[0]!.field_source) {
                skipped.push({ proposal_id: p.id, reason: "already_mapped" });
                continue;
            }
            const key = p.target_field_source?.field_key ?? "";
            if (NAME_PART_KEY.test(key) && suggestsNameComposition({ type: "text", label: fields[0]!.label })) {
                skipped.push({ proposal_id: p.id, reason: "whole_name" });
                continue;
            }
        }
        decisions[p.id] = "accepted";
    }
    if (Object.keys(decisions).length === 0) return { draft: input, application: null, skipped };

    const { updatedDraft, result } = applyDiscovery({ draft: input, discovery, decisions, ledger: [] });
    const applied = new Set(result.results.filter((r) => r.outcome === "applied").map((r) => r.proposal_id));
    // The concept review reads the proposal's own state when no operator decision is recorded, so an
    // applied proposal shows as accepted there — and can be reversed there.
    if (updatedDraft.configuration_discovery) {
        updatedDraft.configuration_discovery = {
            ...updatedDraft.configuration_discovery,
            proposals: updatedDraft.configuration_discovery.proposals.map((p) =>
                applied.has(p.id) ? { ...p, decision_state: "accepted" as const } : p,
            ),
        };
    }
    return { draft: updatedDraft, application: result, skipped };
}
