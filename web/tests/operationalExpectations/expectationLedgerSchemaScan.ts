/**
 * Expectation-ledger schema scanner (TEST INFRA) — a THIN wrapper over the shared
 * ledger scan mechanics (tests/operationalLedger/ledgerSchemaScan.ts). It names
 * only the Expectation ledger's own table/trigger/policy/constraint tokens; the
 * generic "created-and-not-dropped over cumulative history" logic lives once in
 * the shared module (no second scanner). Mirrors the attendance scanner, which is
 * the same thin wrapper for the Facts ledger.
 *
 * No product code — pure test scaffolding over migration SQL text.
 */

import {
    appendOnlyTriggerPresent,
    columnInCreateBlock,
    columnServerAssignedNow,
    createBlockColumnNames,
    grantsPrivilegeTo,
    hasUpdatedAtColumn,
    insertPolicyForRolePresent,
    namedCheckConstraintPresent,
    policyPresent,
    readMigrationsOrderedTouching,
    selfRefFkPresent,
    stripSqlComments,
} from "../operationalLedger/ledgerSchemaScan";

const LEDGER_TABLE = "operational_expectations";

export interface ExpectationLedgerSchemaFacts {
    /** append-only mutation-block trigger present (created, not later dropped). */
    appendOnlyTrigger: boolean;
    /** self-referential supersedes_expectation_id FK present. */
    supersedesSelfFk: boolean;
    /** no-self-reference CHECK present. */
    noSelfRef: boolean;
    /** create-vs-supersede link-shape CHECK present. */
    createLinkShape: boolean;
    /** verb→transition map CHECK present. */
    verbTransitionMap: boolean;
    /** modality closed-five CHECK present. */
    modalityCheck: boolean;
    /** verb closed-five CHECK present. */
    verbCheck: boolean;
    /** transition-type closed-four CHECK present. */
    transitionTypeCheck: boolean;
    /** standing closed-three CHECK present. */
    standingCheck: boolean;
    /** Temporal-Frame presence CHECK present. */
    temporalFramePresence: boolean;
    /** org-scoped SELECT policy present. */
    orgSelectPolicy: boolean;
    /** valid_from (valid-time) column present. */
    hasValidFrom: boolean;
    /** authored_at (transaction-time) column present. */
    hasAuthoredAt: boolean;
    /** footprint column present. */
    hasFootprint: boolean;
    /** updated_at column present (append-only ledgers must NOT have one). */
    hasUpdatedAt: boolean;
    /** the column names declared in the ledger's own CREATE TABLE block. */
    createBlockColumns: string[];
    // -- Write boundary (Wave A: no direct client authoring path) --------------
    /** `authenticated` is GRANTed INSERT (Wave A: must be FALSE). */
    grantsInsertToAuthenticated: boolean;
    /** `anon` is GRANTed INSERT (must be FALSE). */
    grantsInsertToAnon: boolean;
    /** an INSERT policy exists for `authenticated` (Wave A: must be FALSE). */
    authenticatedInsertPolicy: boolean;
    /** an INSERT policy exists for `anon` (must be FALSE). */
    anonInsertPolicy: boolean;
    /** `authenticated` retains org-scoped SELECT (must be TRUE). */
    grantsSelectToAuthenticated: boolean;
    // -- Recorded-time integrity ----------------------------------------------
    /** authored_at is server-assigned (`NEW.authored_at := now()`), not forgeable. */
    authoredAtServerAssigned: boolean;
    // -- Lineage integrity (DB-enforced, not app-only) ------------------------
    /** the lineage-validation trigger rejects a cross-org predecessor (DB-level). */
    lineageCrossOrgGuard: boolean;
    /** a mutable status column exists (cancellation must be a row, so must be FALSE). */
    hasStatusColumn: boolean;
}

/**
 * Resolve the cumulative ledger schema facts from ordered migration SQL. Exposed
 * for the drift unit test.
 */
export function scanExpectationLedgerSchema(rawSql: string): ExpectationLedgerSchemaFacts {
    const sql = stripSqlComments(rawSql);
    return {
        appendOnlyTrigger: appendOnlyTriggerPresent(sql, "trg_prevent_operational_expectations_mutation"),
        supersedesSelfFk: selfRefFkPresent(sql, LEDGER_TABLE, "supersedes_expectation_id"),
        noSelfRef: namedCheckConstraintPresent(sql, "operational_expectations_no_self_reference"),
        createLinkShape: namedCheckConstraintPresent(sql, "operational_expectations_create_link_shape"),
        verbTransitionMap: namedCheckConstraintPresent(sql, "operational_expectations_verb_transition_map"),
        modalityCheck: namedCheckConstraintPresent(sql, "operational_expectations_modality_check"),
        verbCheck: namedCheckConstraintPresent(sql, "operational_expectations_verb_check"),
        transitionTypeCheck: namedCheckConstraintPresent(sql, "operational_expectations_transition_type_check"),
        standingCheck: namedCheckConstraintPresent(sql, "operational_expectations_standing_check"),
        temporalFramePresence: namedCheckConstraintPresent(sql, "operational_expectations_temporal_frame_present"),
        orgSelectPolicy: policyPresent(sql, "operational_expectations_select_org"),
        hasValidFrom: columnInCreateBlock(sql, LEDGER_TABLE, "valid_from"),
        hasAuthoredAt: columnInCreateBlock(sql, LEDGER_TABLE, "authored_at"),
        hasFootprint: columnInCreateBlock(sql, LEDGER_TABLE, "footprint"),
        hasUpdatedAt: hasUpdatedAtColumn(sql, LEDGER_TABLE),
        createBlockColumns: createBlockColumnNames(sql, LEDGER_TABLE),
        grantsInsertToAuthenticated: grantsPrivilegeTo(sql, LEDGER_TABLE, "insert", "authenticated"),
        grantsInsertToAnon: grantsPrivilegeTo(sql, LEDGER_TABLE, "insert", "anon"),
        authenticatedInsertPolicy: insertPolicyForRolePresent(sql, LEDGER_TABLE, "authenticated"),
        anonInsertPolicy: insertPolicyForRolePresent(sql, LEDGER_TABLE, "anon"),
        grantsSelectToAuthenticated: grantsPrivilegeTo(sql, LEDGER_TABLE, "select", "authenticated"),
        authoredAtServerAssigned: columnServerAssignedNow(sql, "authored_at"),
        // The RAISE string survives comment-stripping (it is a literal, not a comment).
        lineageCrossOrgGuard: /supersession must target a row on the same org/i.test(sql),
        hasStatusColumn: columnInCreateBlock(sql, LEDGER_TABLE, "status"),
    };
}

/** Read + concatenate (chronological) every migration touching the ledger table. */
export function readExpectationLedgerMigrationsOrdered(): { concatenated: string; files: string[] } {
    return readMigrationsOrderedTouching(LEDGER_TABLE);
}
