/**
 * What may a single click accept?
 *
 * "Accept 28 high-confidence" reads as a safe convenience and was not one. Confidence measures how
 * sure the matcher is about the QUESTION — it says nothing about whether the destination is safe. A
 * 99%-confident routing number is still a routing number, and sweeping it into a customer field with
 * one click is worse than proposing it, because nobody read the row.
 *
 * So bulk acceptance needs two independent agreements: the matcher is confident, AND the ownership
 * conclusion is one a person does not need to see. Either one alone is not enough.
 *
 * Pure + deterministic. No I/O.
 */

import type { ConfigurationProposal, ProposalDisposition } from "./contracts";

/**
 * Dispositions a bulk action may accept.
 *
 * Everything absent from this list is excluded, so a NEW disposition is excluded until someone
 * decides otherwise — the safe direction for a default. Note what is deliberately missing:
 *
 *  - `create_proposed_field` — creating durable vocabulary is never a bulk action, even when the
 *    ownership conclusion is sound. New truth deserves one person reading one row.
 *  - `financial_payment`, `held_*`, `derived_value_system` — nothing to accept; these are held.
 *  - `safeguarding_binding` — a restriction waits for a person by design.
 *  - `unresolved` — unclassified is the opposite of confident.
 */
const BULK_ACCEPTABLE_DISPOSITIONS: readonly ProposalDisposition[] = [
    "reuse_canonical_field",
    "reuse_existing_field",
    "relationship_binding",
    "structured_collection",
    "upload_requirement",
    "acknowledgement",
    "signature_requirement",
    "static_content",
    "output_binding",
    "form_only_response",
];

const BULK_ACCEPTABLE = new Set<string>(BULK_ACCEPTABLE_DISPOSITIONS);

export interface BulkAcceptVerdict {
    safe: boolean;
    /** Why not, for the operator and for a test that needs to prove the reason, not just the answer. */
    reason?: string;
}

export function bulkAcceptVerdict(p: Pick<ConfigurationProposal,
    "disposition" | "confidence" | "validation_issues" | "ownership_routing" | "refused_binding">): BulkAcceptVerdict {
    if (!BULK_ACCEPTABLE.has(p.disposition)) {
        return { safe: false, reason: `${p.disposition} is not something a bulk action may accept` };
    }
    // The ownership conclusion has its own veto, independent of the disposition list. Both must agree.
    if (p.ownership_routing && !p.ownership_routing.bulkAcceptSafe) {
        return { safe: false, reason: `owned by ${p.ownership_routing.owner} — needs a person` };
    }
    if (p.confidence.band !== "high") {
        return { safe: false, reason: "not high confidence" };
    }
    if (p.validation_issues.length > 0) {
        return { safe: false, reason: "has unresolved validation issues" };
    }
    if (p.refused_binding) {
        return { safe: false, reason: "a canonical binding was refused for this concept" };
    }
    return { safe: true };
}

export function isBulkAcceptSafe(p: Parameters<typeof bulkAcceptVerdict>[0]): boolean {
    return bulkAcceptVerdict(p).safe;
}
