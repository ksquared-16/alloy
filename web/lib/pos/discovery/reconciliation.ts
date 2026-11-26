/**
 * POS-FP16 / M5A — durable discovery identity + rerun reconciliation.
 *
 * A detector rerun must NEVER silently erase operator decisions. Reconciliation is deterministic and
 * built on FOUR separated identities (not one `page:section:slug`):
 *
 *   1. SourceOccurrenceIdentity   — the exact occurrence in THIS source version (page:section:label).
 *                                   Changes when the layout moves.
 *   2. SemanticConceptIdentity    — the normalized concept (concept_key · subject · role/requirement).
 *                                   Survives layout changes — the anchor for decision preservation.
 *   3. ConfigurationProposalIdentity — semantic identity + proposed disposition + target.
 *   4. OperatorDecisionIdentity   — a durable decision against a proposal/concept version.
 *
 * Reconciliation prefers SEMANTIC identity so a decision survives an inserted page, a renamed section,
 * a detector-version bump, or a harmless label reformat. It degrades honestly: an ambiguous semantic
 * match asks for review; a materially changed concept becomes stale; a removed concept stays auditable.
 *
 * Pure + deterministic. No I/O.
 */

import type { BusinessConceptCandidate, ConfigurationProposal, ProposalDecisionState } from "./contracts";

export type SourceOccurrenceIdentity = string; // `${page}:${section_key}:${label_norm}`
export type SemanticConceptIdentity = string; // `${concept_key|unresolved}|${subject}|${role|requirement|''}`
export type ConfigurationProposalIdentity = string; // `${semantic}#${disposition}#${target}`

export function sourceOccurrenceIdentity(c: BusinessConceptCandidate): SourceOccurrenceIdentity {
    return c.id; // already `${page}:${section_key}:${slug}`
}

export function semanticConceptIdentity(c: BusinessConceptCandidate): SemanticConceptIdentity {
    const key = c.concept_key ?? `unresolved:${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const qualifier = c.relationship_role ?? c.requirement_type ?? "";
    return `${key}|${c.subject}|${qualifier}`;
}

export function proposalIdentity(p: ConfigurationProposal, semantic: SemanticConceptIdentity): ConfigurationProposalIdentity {
    const target =
        p.target_field_source ? `${p.target_field_source.entity_type}.${p.target_field_source.field_key}`
        : p.target_relationship_role ? `role:${p.target_relationship_role}`
        : p.target_requirement_type ? `req:${p.target_requirement_type}`
        : p.proposed_field ? `new:${p.proposed_field.entity_type}.${p.proposed_field.suggested_field_key}`
        : "";
    return `${semantic}#${p.disposition}#${target}`;
}

/** A durable operator decision — persisted separately from detector output. */
export interface DiscoveryDecisionRecord {
    /** OperatorDecisionIdentity anchor: the semantic identity it was made against. */
    semantic_identity: SemanticConceptIdentity;
    /** The source occurrence + proposal identity at decision time (for exact-match + audit). */
    source_occurrence: SourceOccurrenceIdentity;
    proposal_identity: ConfigurationProposalIdentity;
    decision_state: ProposalDecisionState;
    /** Operator-chosen target when the operator changed the match (overrides the proposal). */
    accepted_target?: { field_source?: { entity_type: string; field_key: string }; relationship_role?: string } | null;
    override_reason?: string | null;
    actor: string;
    decided_at: string;
    /** Set by reconciliation when a rerun made this decision stale. */
    stale?: boolean;
    /** Application status (set by the apply service). */
    application_status?: "not_applied" | "applied" | "failed";
}

export type ReconcileStatus =
    | "unchanged" // exact source occurrence — decision carries verbatim
    | "moved" // same semantic identity, different source location — decision carries, flagged moved
    | "ambiguous" // semantic identity matches multiple prior decisions — operator must confirm
    | "new" // no prior decision — pending
    | "stale" // prior decision's concept materially changed — decision preserved but flagged stale
    | "removed"; // prior decision has no matching concept this run — kept auditable

export interface ReconcileEntry {
    status: ReconcileStatus;
    concept_id?: string;
    semantic_identity: SemanticConceptIdentity;
    /** The carried-forward decision (present for unchanged/moved/stale/removed). */
    decision?: DiscoveryDecisionRecord;
    note: string;
}

export interface ReconcileResult {
    entries: ReconcileEntry[];
    /** Decisions to persist after reconciliation (carried + newly-stale, minus nothing — removed kept). */
    reconciled: DiscoveryDecisionRecord[];
    counts: Record<ReconcileStatus, number>;
}

/**
 * Reconcile prior decisions against a fresh discovery run. Semantic identity is the anchor:
 * a decision survives layout changes when the concept's meaning is unchanged.
 */
export function reconcileDiscovery(
    priorDecisions: DiscoveryDecisionRecord[],
    nextConcepts: BusinessConceptCandidate[],
): ReconcileResult {
    const entries: ReconcileEntry[] = [];
    const reconciled: DiscoveryDecisionRecord[] = [];
    const counts: Record<ReconcileStatus, number> = { unchanged: 0, moved: 0, ambiguous: 0, new: 0, stale: 0, removed: 0 };

    // Index prior decisions by semantic + occurrence.
    const priorBySemantic = new Map<SemanticConceptIdentity, DiscoveryDecisionRecord[]>();
    const priorByOccurrence = new Map<SourceOccurrenceIdentity, DiscoveryDecisionRecord>();
    for (const d of priorDecisions) {
        const arr = priorBySemantic.get(d.semantic_identity) ?? [];
        arr.push(d);
        priorBySemantic.set(d.semantic_identity, arr);
        priorByOccurrence.set(d.source_occurrence, d);
    }

    const matchedPrior = new Set<DiscoveryDecisionRecord>();

    for (const c of nextConcepts) {
        const occ = sourceOccurrenceIdentity(c);
        const sem = semanticConceptIdentity(c);

        // 1. exact source occurrence match — unchanged.
        const exact = priorByOccurrence.get(occ);
        if (exact && exact.semantic_identity === sem && !matchedPrior.has(exact)) {
            matchedPrior.add(exact);
            reconciled.push(exact);
            entries.push({ status: "unchanged", concept_id: c.id, semantic_identity: sem, decision: exact, note: "Same source occurrence — decision preserved." });
            counts.unchanged++;
            continue;
        }

        // 2. exact semantic identity match at a different location — moved.
        const semMatches = (priorBySemantic.get(sem) ?? []).filter((d) => !matchedPrior.has(d));
        if (semMatches.length === 1) {
            const d = semMatches[0];
            matchedPrior.add(d);
            const carried: DiscoveryDecisionRecord = { ...d, source_occurrence: occ };
            reconciled.push(carried);
            entries.push({ status: "moved", concept_id: c.id, semantic_identity: sem, decision: carried, note: "Same concept at a new source location — decision preserved." });
            counts.moved++;
            continue;
        }
        if (semMatches.length > 1) {
            entries.push({ status: "ambiguous", concept_id: c.id, semantic_identity: sem, note: "Concept matches more than one prior decision — please confirm." });
            counts.ambiguous++;
            continue;
        }

        // 3. no prior decision — new pending concept.
        entries.push({ status: "new", concept_id: c.id, semantic_identity: sem, note: "Newly discovered — pending review." });
        counts.new++;
    }

    // 4. prior decisions with no match this run — removed but auditable; a decided one is flagged stale.
    for (const d of priorDecisions) {
        if (matchedPrior.has(d)) continue;
        const wasDecided = d.decision_state !== "proposed";
        const carried: DiscoveryDecisionRecord = { ...d, stale: true };
        reconciled.push(carried);
        if (wasDecided) {
            entries.push({ status: "stale", semantic_identity: d.semantic_identity, decision: carried, note: "A prior decision's concept was not re-detected — flagged stale for review." });
            counts.stale++;
        } else {
            entries.push({ status: "removed", semantic_identity: d.semantic_identity, decision: carried, note: "Concept no longer detected — kept for audit." });
            counts.removed++;
        }
    }

    return { entries, reconciled, counts };
}
