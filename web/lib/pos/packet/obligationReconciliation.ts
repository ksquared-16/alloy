/**
 * What happened to every obligation the packet analysis discovered.
 *
 * The invariant this replaces was arithmetic, and wrong:
 *
 *     4 discovered uploads → 4 executable uploads
 *
 * It was wrong because it assumed the reader's SHAPE (a clause asking for a form) settles the
 * obligation's OWNER. Three of the four are documents. The fourth is payment setup, whose owner is
 * Financials/Payments — a program that exists in plan and not yet in product. Forcing it to satisfy
 * the old count would have asked a family to upload bank paperwork.
 *
 * The correct invariant is a reconciliation, not an equality:
 *
 *     discovered = executable + deferred + dropped,  and  dropped MUST be 0
 *
 * `dropped` is the whole point. An obligation that is neither executable nor deferred has been lost,
 * and the count is what makes that loud instead of invisible.
 *
 * Pure + deterministic. No I/O.
 */

import type { ConfigurationProposal, DeferredCapability } from "@/lib/pos/discovery/contracts";

export interface ObligationLine {
    concept_id: string;
    clause: string;
    disposition: ConfigurationProposal["disposition"] | "no_proposal";
}

export interface ObligationReconciliation {
    /** Every obligation the reader raised in document/payment shape. */
    discovered: number;
    /** Obligations that become an executable document requirement on a Form. */
    executable: ObligationLine[];
    /** Obligations held for an owner Alloy has not built. Recorded, never executed. */
    deferred: (ObligationLine & { deferred_capability: DeferredCapability })[];
    /** Neither executable nor deferred. Must be empty — anything here is a lost requirement. */
    dropped: ObligationLine[];
    ok: boolean;
}

export interface ObligationConcept {
    id: string;
    kind: string;
    label: string;
}

/**
 * Reconcile what the READER raised against what the packet DID with it.
 *
 * `concepts` is required, and that is the point. Counting only proposals would define "discovered"
 * by the outcome — every obligation would land in `executable` or `deferred` by construction, and
 * `dropped` could never be anything but zero. Anchoring on the concept means an obligation that
 * quietly became static content, or lost its proposal altogether, shows up as lost.
 */
export function reconcileDocumentObligations(
    proposals: readonly Pick<ConfigurationProposal, "candidate_id" | "disposition" | "deferred_capability">[],
    concepts: readonly ObligationConcept[],
): ObligationReconciliation {
    const byCandidate = new Map(proposals.map((p) => [p.candidate_id, p]));

    // The reader's own obligation shape, plus anything a deferral was raised on — a deferral from
    // some other concept kind would still be an obligation this reconciliation owes an answer for.
    const obligations = new Map<string, ObligationConcept>();
    for (const c of concepts) if (c.kind === "upload_requirement") obligations.set(c.id, c);
    for (const p of proposals) {
        if (!p.deferred_capability || obligations.has(p.candidate_id)) continue;
        const c = concepts.find((x) => x.id === p.candidate_id);
        obligations.set(p.candidate_id, c ?? { id: p.candidate_id, kind: "upload_requirement", label: p.deferred_capability.clause });
    }

    const executable: ObligationLine[] = [];
    const deferred: ObligationReconciliation["deferred"] = [];
    const dropped: ObligationLine[] = [];

    for (const c of obligations.values()) {
        const p = byCandidate.get(c.id);
        const line: ObligationLine = { concept_id: c.id, clause: c.label, disposition: p?.disposition ?? "no_proposal" };
        if (p?.deferred_capability) deferred.push({ ...line, deferred_capability: p.deferred_capability });
        else if (p?.disposition === "upload_requirement") executable.push(line);
        else dropped.push(line);
    }

    const discovered = obligations.size;
    return { discovered, executable, deferred, dropped, ok: dropped.length === 0 };
}

/** One line for a report or a log. Reads as a reconciliation, not as a pass/fail. */
export function describeObligationReconciliation(r: ObligationReconciliation): string {
    return `${r.discovered} document/payment-like obligations discovered → ${r.executable.length} Enrollment document-upload obligations → ${r.deferred.length} deferred Financials/Payments obligation${r.deferred.length === 1 ? "" : "s"} → ${r.dropped.length} dropped`;
}
