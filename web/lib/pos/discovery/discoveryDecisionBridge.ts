/**
 * POS-FP16 / M5A — bridge the concept-review UI (per-proposal decision state) to durable decision
 * records (semantic-identity anchored). Pure; the UI persists records and rehydrates from them so a
 * decision survives reload/second-operator, and reconciliation keys on semantic identity.
 */

import type { ConfigurationDiscoveryResult, ProposalDecisionState } from "./contracts";
import { proposalIdentity, semanticConceptIdentity, sourceOccurrenceIdentity, type DiscoveryDecisionRecord } from "./reconciliation";

/** Build durable records from the UI's per-proposal decision map (only non-default states persist). */
export function toDecisionRecords(
    discovery: ConfigurationDiscoveryResult,
    uiDecisions: Record<string, ProposalDecisionState>,
    actor: string,
    now: string,
): DiscoveryDecisionRecord[] {
    const conceptById = new Map(discovery.concepts.map((c) => [c.id, c]));
    const out: DiscoveryDecisionRecord[] = [];
    for (const p of discovery.proposals) {
        const state = uiDecisions[p.id] ?? p.decision_state;
        if (state === "proposed") continue; // only durable decisions persist
        const concept = conceptById.get(p.candidate_id);
        if (!concept) continue;
        const sem = semanticConceptIdentity(concept);
        out.push({
            semantic_identity: sem,
            source_occurrence: sourceOccurrenceIdentity(concept),
            proposal_identity: proposalIdentity(p, sem),
            decision_state: state,
            actor,
            decided_at: now,
        });
    }
    return out;
}

/** Rehydrate the UI's per-proposal decision map from durable records (matched by semantic identity). */
export function fromDecisionRecords(
    discovery: ConfigurationDiscoveryResult,
    records: DiscoveryDecisionRecord[],
): Record<string, ProposalDecisionState> {
    const conceptById = new Map(discovery.concepts.map((c) => [c.id, c]));
    const bySemantic = new Map<string, DiscoveryDecisionRecord>();
    const byOccurrence = new Map<string, DiscoveryDecisionRecord>();
    for (const r of records) {
        bySemantic.set(r.semantic_identity, r);
        byOccurrence.set(r.source_occurrence, r);
    }
    const out: Record<string, ProposalDecisionState> = {};
    for (const p of discovery.proposals) {
        const concept = conceptById.get(p.candidate_id);
        if (!concept) continue;
        // exact occurrence first, then semantic identity (survives layout changes).
        const rec = byOccurrence.get(sourceOccurrenceIdentity(concept)) ?? bySemantic.get(semanticConceptIdentity(concept));
        if (rec) out[p.id] = rec.decision_state;
    }
    return out;
}
