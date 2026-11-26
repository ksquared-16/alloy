/**
 * Operational Expectation ledger descriptor (P1 · Wave A).
 *
 * Declares how the `operational_expectations` table satisfies the twin-ledger
 * SUBSTRATE contract. Asserted by expectationLedgerConformance.test.ts. This is
 * a declarative descriptor — no behavior.
 *
 * Keep aligned with:
 *   supabase/migrations/20260717000000_operational_expectations_ledger_p1_wave_a.sql
 *   web/lib/operationalExpectations/expectationLedgerContract.ts
 */

import {
    EXPECTATION_STANDINGS,
    EXPECTATION_TRANSITION_TYPES,
    EXPECTATION_VERBS,
    OPERATIONAL_MODALITIES,
    type OperationalExpectationLedgerDescriptor,
} from "@/lib/operationalExpectations/expectationLedgerContract";

export const OPERATIONAL_EXPECTATIONS_TABLE = "operational_expectations";

export const OPERATIONAL_EXPECTATION_LEDGER_DESCRIPTOR: OperationalExpectationLedgerDescriptor = {
    // Shared AppendOnlyLedgerDescriptor substrate fields.
    tableName: OPERATIONAL_EXPECTATIONS_TABLE,
    orgColumn: "org_id",
    lineageColumn: "supersedes_expectation_id",
    effectiveTimeColumn: "valid_from",
    recordedTimeColumn: "authored_at",
    appendOnly: true,
    // Authored-ledger extensions.
    modalityColumn: "modality",
    verbColumn: "verb",
    transitionTypeColumn: "transition_type",
    standingColumn: "standing",
    footprintColumn: "footprint",
    modalityVocabulary: OPERATIONAL_MODALITIES,
    verbVocabulary: EXPECTATION_VERBS,
    transitionTypeVocabulary: EXPECTATION_TRANSITION_TYPES,
    standingVocabulary: EXPECTATION_STANDINGS,
};
