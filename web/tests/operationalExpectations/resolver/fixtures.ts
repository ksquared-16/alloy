/**
 * Shared fixtures for the Effective Expectation Resolver certification suite.
 * Pure builders — no IO. Timestamps are injected (the resolver reads no clock).
 */

import type { ExpectationLedgerRow } from "@/lib/operationalExpectations/resolver/effectiveExpectationTypes";

/** A ledger row with sensible defaults; `id` is required and roots its own lineage by default. */
export function row(
    over: Partial<ExpectationLedgerRow> & { id: string },
): ExpectationLedgerRow {
    const base: ExpectationLedgerRow = {
        id: over.id,
        org_id: "org-1",
        lineage_root_id: over.id, // a create roots itself
        supersedes_expectation_id: null,
        verb: "create",
        transition_type: null,
        modality: "required",
        author_class: "human",
        authority_key: "user:admin",
        standing: "binding",
        subject_kind: "room",
        valid_from: "2026-01-01T00:00:00Z",
        valid_to: null,
        authored_at: "2026-01-01T00:00:00Z",
    };
    return { ...base, ...over };
}

/** A deterministic shuffle (index-driven, no Math.random) for order-independence proofs. */
export function shuffled<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = (i * 7 + 3) % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
