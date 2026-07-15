/**
 * Operational Expectation Ledger — conformance harness (P1 · Wave A).
 *
 * Asserts the authored Expectation ledger is a well-formed append-only twin of
 * Facts PLUS a well-formed authored ledger. It does NOT re-implement the generic
 * substrate invariants — it DELEGATES them to the shared, platform-owned
 * `assertLedgerSubstrateConforms` (operationalLedger/ledgerSubstrateConformance.ts),
 * the same core Facts uses. This file adds ONLY the authored-ledger checks:
 *   - bitemporal columns present (valid-time + transaction-time);
 *   - Temporal-Frame presence + footprint declaration;
 *   - lineage SHAPE: create-vs-supersede link + verb→transition map (the
 *     Revision≠Correction typing is load-bearing);
 *   - CLOSED vocabularies: modality (5), verb (5), transition (4), standing (3);
 *   - required tuple/lineage/standing/footprint columns.
 *
 * This certifies the SUBSTRATE only. The authoring-intake half (Authoring Act /
 * Ratification Act emission, the Authority→Standing gate) is Wave B/C; the pure
 * evaluation that reads the ledger is P3. Neither is asserted here.
 *
 * Probe-driven so it runs WITHOUT a live Postgres.
 */

import {
    assertLedgerSubstrateConforms,
    type LedgerSubstrateCheck,
    type LedgerSubstrateProbes,
} from "@/lib/operationalLedger/ledgerSubstrateConformance";
import {
    EXPECTATION_STANDINGS,
    EXPECTATION_TRANSITION_TYPES,
    EXPECTATION_VERBS,
    OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS,
    OPERATIONAL_MODALITIES,
    type OperationalExpectationLedgerDescriptor,
} from "@/lib/operationalExpectations/expectationLedgerContract";

/**
 * Runtime observations of the Expectation ledger. Extends the shared substrate
 * probes with the authored-ledger observations.
 */
export interface ExpectationLedgerProbes extends LedgerSubstrateProbes {
    /** The modality vocabulary the storage CHECK enforces. */
    modalityVocabulary: readonly string[];
    /** The verb vocabulary the storage CHECK enforces. */
    verbVocabulary: readonly string[];
    /** The transition-type vocabulary the storage CHECK enforces. */
    transitionTypeVocabulary: readonly string[];
    /** The standing vocabulary the storage CHECK enforces. */
    standingVocabulary: readonly string[];
    /**
     * The create-vs-supersede link shape is enforced: a `create` has no prior row
     * and no transition type; every other verb has both (verb→transition map).
     */
    createLinkShapeGuard: boolean;
    /** A required valid-time (bitemporal) column exists. */
    hasValidTimeColumn: boolean;
    /** A required immutable transaction-time (authored) column exists. */
    hasAuthoredTimeColumn: boolean;
    /** A Temporal-Frame presence guard exists (the frame is required). */
    temporalFramePresenceGuard: boolean;
    /** A declared dependency-footprint column exists (handed to Processing, P4). */
    hasFootprintColumn: boolean;
    /** The columns present on the ledger table (for required-column completeness). */
    presentColumns: readonly string[];
    /**
     * No ordinary (anon/authenticated) role can author directly: no client INSERT
     * grant AND no client INSERT policy. Writes arrive only via the Wave B intake
     * behind service infrastructure. (service_role FOR ALL infrastructure is fine.)
     */
    noOrdinaryRoleDirectInsert: boolean;
    /** Recorded/transaction time is server-assigned (non-forgeable). */
    recordedTimeServerAssigned: boolean;
}

export interface LedgerConformanceCheck {
    property: string;
    half: "storage" | "lineage" | "vocabulary";
    passed: boolean;
    detail: string;
}

export interface LedgerConformanceReport {
    tableName: string;
    conforms: boolean;
    checks: LedgerConformanceCheck[];
    warnings: string[];
}

/** Vocabulary matches exactly: has every expected member and no extras. */
function vocabularyExact(observed: readonly string[], expected: readonly string[]): boolean {
    const expectedSet = new Set<string>(expected);
    const hasAll = expected.every((t) => observed.includes(t));
    const noExtras = observed.every((t) => expectedSet.has(t));
    return hasAll && noExtras && observed.length > 0;
}

/**
 * Assert the Expectation ledger conforms. Returns a structured report (never
 * throws); the caller asserts `report.conforms`. The generic substrate half is
 * the shared core's output verbatim; the authored-ledger half is added here.
 */
export async function assertExpectationLedgerConforms(
    descriptor: OperationalExpectationLedgerDescriptor,
    probes: ExpectationLedgerProbes,
): Promise<LedgerConformanceReport> {
    const warnings: string[] = [];

    // -- Shared substrate half (append-only, no-updated-at, org RLS, lineage
    //    self-ref + no-self-ref) — ONE definition, reused, never re-implemented.
    const substrate: LedgerSubstrateCheck[] = await assertLedgerSubstrateConforms(descriptor, probes);
    const checks: LedgerConformanceCheck[] = substrate.map((c) => ({ ...c }));

    // -- Authored-ledger storage extensions -----------------------------------
    checks.push({
        property: "bitemporal_columns",
        half: "storage",
        passed: probes.hasValidTimeColumn === true && probes.hasAuthoredTimeColumn === true,
        detail: `valid-time(${descriptor.effectiveTimeColumn})=${probes.hasValidTimeColumn}; authored-time(${descriptor.recordedTimeColumn})=${probes.hasAuthoredTimeColumn}`,
    });
    checks.push({
        property: "temporal_frame_presence",
        half: "storage",
        passed: probes.temporalFramePresenceGuard === true,
        detail: `Temporal-Frame presence guard present=${probes.temporalFramePresenceGuard}`,
    });
    checks.push({
        property: "footprint_declaration",
        half: "storage",
        passed: probes.hasFootprintColumn === true,
        detail: `footprint column(${descriptor.footprintColumn}) present=${probes.hasFootprintColumn}`,
    });

    // -- Write boundary (Wave A: no client authoring path — writes via Wave B) --
    checks.push({
        property: "authoring_write_boundary",
        half: "storage",
        passed: probes.noOrdinaryRoleDirectInsert === true,
        detail: `no anon/authenticated direct INSERT (grant or policy); only service infra can insert=${probes.noOrdinaryRoleDirectInsert}`,
    });
    checks.push({
        property: "recorded_time_server_assigned",
        half: "storage",
        passed: probes.recordedTimeServerAssigned === true,
        detail: `recorded/transaction time (${descriptor.recordedTimeColumn}) is server-assigned + immutable=${probes.recordedTimeServerAssigned}`,
    });

    // -- Lineage shape (Revision≠Correction typing is load-bearing) ------------
    checks.push({
        property: "create_vs_supersede_link_shape",
        half: "lineage",
        passed: probes.createLinkShapeGuard === true,
        detail: `create ⇒ no prior/no transition; supersede ⇒ prior + transition; guard present=${probes.createLinkShapeGuard}`,
    });

    // -- Vocabulary half (closed modality/verb/transition/standing) -----------
    checks.push({
        property: "modality_closure",
        half: "vocabulary",
        passed: vocabularyExact(probes.modalityVocabulary, OPERATIONAL_MODALITIES),
        detail: `modality=[${probes.modalityVocabulary.join(",")}] expected=[${OPERATIONAL_MODALITIES.join(",")}]`,
    });
    checks.push({
        property: "verb_closure",
        half: "vocabulary",
        passed: vocabularyExact(probes.verbVocabulary, EXPECTATION_VERBS),
        detail: `verb=[${probes.verbVocabulary.join(",")}] expected=[${EXPECTATION_VERBS.join(",")}]`,
    });
    checks.push({
        property: "transition_type_closure",
        half: "vocabulary",
        passed: vocabularyExact(probes.transitionTypeVocabulary, EXPECTATION_TRANSITION_TYPES),
        detail: `transition=[${probes.transitionTypeVocabulary.join(",")}] expected=[${EXPECTATION_TRANSITION_TYPES.join(",")}]`,
    });
    checks.push({
        property: "standing_closure",
        half: "vocabulary",
        passed: vocabularyExact(probes.standingVocabulary, EXPECTATION_STANDINGS),
        detail: `standing=[${probes.standingVocabulary.join(",")}] expected=[${EXPECTATION_STANDINGS.join(",")}]`,
    });

    // -- Required-column completeness -----------------------------------------
    const missing = OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS.filter(
        (c) => !probes.presentColumns.includes(c),
    );
    checks.push({
        property: "required_columns_present",
        half: "storage",
        passed: missing.length === 0,
        detail: missing.length === 0
            ? `all ${OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS.length} required columns present`
            : `missing=[${missing.join(",")}]`,
    });

    const conforms = checks.every((c) => c.passed);
    return { tableName: descriptor.tableName, conforms, checks, warnings };
}
