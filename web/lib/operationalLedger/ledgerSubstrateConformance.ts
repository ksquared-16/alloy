/**
 * Operational Ledger Substrate Conformance (neutral, platform-owned).
 *
 * The SINGLE definition of the generic append-only ledger invariants — reused by
 * every canonical ledger so there is never a second, independently-drifting copy
 * of "append-only" / "tenant-scoped" / "lineage self-reference" rules:
 *   - Operational Facts, via operationalFacts/factConformance.ts (delegates here);
 *   - Operational Expectations, via
 *     operationalExpectations/expectationLedgerConformance.ts (delegates here).
 *
 * Each ledger's own harness calls `assertLedgerSubstrateConforms` for the shared
 * invariants and then appends its DOMAIN-specific checks (Facts: entry-type
 * vocabulary + emitted-event completeness; Expectations: modality/verb/transition/
 * standing closure + tuple/lineage shape). This is the shared half of "one
 * canonical ledger substrate".
 *
 * Probe-driven so it runs WITHOUT a live Postgres: the caller supplies the runtime
 * observations (a test scans migration DDL; a live-DB harness observes the real
 * database).
 */

import type { AppendOnlyLedgerDescriptor } from "@/lib/operationalLedger/ledgerSubstrateContract";

/** Runtime observations of an append-only ledger's substrate, caller-supplied. */
export interface LedgerSubstrateProbes {
    /**
     * Attempt a forbidden mutation. Append-only ledgers must REJECT both UPDATE
     * and DELETE (corrections/supersessions are new rows).
     */
    attemptMutation: (op: "update" | "delete") =>
        | { rejected: boolean; message?: string }
        | Promise<{ rejected: boolean; message?: string }>;
    /** The table has an updated_at column (append-only ledgers must NOT). */
    hasUpdatedAt: boolean;
    /** An org-scoped SELECT policy (RLS) exists. */
    orgScopedRls: boolean;
    /** A self-referential lineage FK (superseding/correcting row → prior row) exists. */
    lineageSelfReference: boolean;
    /** A no-self-reference guard exists (a row cannot supersede/correct itself). */
    noSelfReferenceGuard: boolean;
}

export interface LedgerSubstrateCheck {
    property: string;
    /** Every shared-substrate check belongs to the "storage" half. */
    half: "storage";
    passed: boolean;
    detail: string;
}

/**
 * Assert the generic append-only ledger substrate invariants. Returns the shared
 * check list (never throws); a ledger harness merges these with its domain checks
 * and computes `conforms = checks.every(c => c.passed)`.
 */
export async function assertLedgerSubstrateConforms(
    descriptor: AppendOnlyLedgerDescriptor,
    probes: LedgerSubstrateProbes,
): Promise<LedgerSubstrateCheck[]> {
    const checks: LedgerSubstrateCheck[] = [];

    const updateOutcome = await probes.attemptMutation("update");
    const deleteOutcome = await probes.attemptMutation("delete");
    checks.push({
        property: "append_only",
        half: "storage",
        passed: updateOutcome.rejected && deleteOutcome.rejected,
        detail: `UPDATE rejected=${updateOutcome.rejected}${updateOutcome.message ? ` (${updateOutcome.message})` : ""}; DELETE rejected=${deleteOutcome.rejected}${deleteOutcome.message ? ` (${deleteOutcome.message})` : ""}`,
    });

    checks.push({
        property: "no_updated_at",
        half: "storage",
        passed: probes.hasUpdatedAt === false,
        detail: `append-only ledger must have no updated_at; hasUpdatedAt=${probes.hasUpdatedAt}`,
    });

    checks.push({
        property: "org_scoped_rls",
        half: "storage",
        passed: probes.orgScopedRls === true,
        detail: `org-scoped SELECT policy on ${descriptor.orgColumn}=${probes.orgScopedRls}`,
    });

    checks.push({
        property: "lineage_self_reference",
        half: "storage",
        passed: probes.lineageSelfReference === true,
        detail: `self-FK on ${descriptor.lineageColumn}=${probes.lineageSelfReference}`,
    });

    checks.push({
        property: "no_self_reference_guard",
        half: "storage",
        passed: probes.noSelfReferenceGuard === true,
        detail: `no-self-reference CHECK present=${probes.noSelfReferenceGuard}`,
    });

    return checks;
}
