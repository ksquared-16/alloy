/**
 * Operational Ledger Substrate Contract (neutral, platform-owned).
 *
 * The SINGLE canonical description of the generic append-only / bitemporal /
 * org-scoped / lineage-tracked ledger substrate that BOTH canonical ledgers share
 * — Operational Facts (observed) and Operational Expectations (authored). Neither
 * ledger owns this contract; both conform to it and extend it with their own
 * domain semantics (Facts: entry-type + emitted-event vocabulary; Expectations:
 * modality / verb / transition / standing / tuple grammar).
 *
 * This exists so the shared invariants are defined ONCE. A per-ledger contract
 * that re-declared append-only / tenancy / bitemporal / lineage fields would let
 * the two ledgers drift — precisely what P0 forbade ("one reconciled substrate,
 * not competing machinery"). See docs P0 substrate reconciliation §3.
 */

/**
 * The neutral descriptor of an append-only ledger's substrate. A concrete ledger
 * descriptor (fact stream / expectation ledger) EXTENDS this, adding its own
 * domain columns/vocabularies. Field meanings — never physical signatures.
 */
export interface AppendOnlyLedgerDescriptor {
    /** The authoritative per-domain table (never a universal ledger table). */
    tableName: string;
    /** The org-scope column (org_id NOT NULL + org-scoped RLS). */
    orgColumn: string;
    /**
     * The self-referential lineage column (a superseding/correcting row → the
     * prior row it references). Facts: `corrects_event_id`; Expectations:
     * `supersedes_expectation_id`. Correction/supersession is by REFERENCE, never
     * by mutation.
     */
    lineageColumn: string;
    /** The business/effective (valid) time column. */
    effectiveTimeColumn: string;
    /** The immutable recorded (transaction) time column. */
    recordedTimeColumn: string;
    /** Append-only, superseded/corrected by reference. Always true. */
    appendOnly: true;
}

/** The generic substrate invariants every append-only ledger must satisfy. */
export const LEDGER_SUBSTRATE_INVARIANTS = [
    "append_only",
    "no_updated_at",
    "org_scoped_rls",
    "lineage_self_reference",
    "no_self_reference_guard",
] as const;

export type LedgerSubstrateInvariant = (typeof LEDGER_SUBSTRATE_INVARIANTS)[number];
