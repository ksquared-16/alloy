/**
 * Attendance (Facts) schema scanner (TEST INFRA — audit F3) — a THIN wrapper over
 * the shared ledger scan mechanics (tests/operationalLedger/ledgerSchemaScan.ts).
 *
 * The D2 conformance test verifies storage invariants against the CUMULATIVE
 * migration history: a LATER migration that drops the append-only trigger or adds
 * `updated_at` must flip the observed facts (and fail conformance). That generic
 * "created-and-not-dropped over cumulative history" logic lives ONCE in the shared
 * module; this file only names the attendance table's own tokens. The Expectation
 * ledger scanner is the identical thin wrapper for the authored ledger — one
 * scanner mechanism, two ledgers.
 *
 * No product code — pure test scaffolding over the migration SQL text.
 */

import {
    appendOnlyTriggerPresent,
    createdNotDropped,
    hasUpdatedAtColumn,
    lastPos,
    namedCheckConstraintPresent,
    policyPresent,
    readMigrationsOrderedTouching,
    selfRefFkPresent,
    stripSqlComments,
} from "../operationalLedger/ledgerSchemaScan";

const ATTENDANCE_TABLE = "child_attendance_events";

export interface AttendanceSchemaFacts {
    /** append-only mutation-block trigger present (created, not later dropped). */
    appendOnlyTrigger: boolean;
    /** entry_type vocabulary CHECK present. */
    entryTypeCheck: boolean;
    /** self-referential corrects_event_id FK present. */
    correctsSelfFk: boolean;
    /** no-self-reference CHECK present. */
    noSelfRef: boolean;
    /** org-scoped SELECT policy present. */
    orgSelectPolicy: boolean;
    /** updated_at column present (append-only streams must NOT have one). */
    hasUpdatedAt: boolean;
}

// Re-exported for any caller that imported these helpers from here historically.
export { lastPos, createdNotDropped };

/**
 * Resolve the cumulative attendance schema facts from ordered migration SQL.
 * `rawSql` is the concatenation (chronological) of every migration that mentions
 * the attendance table. Exposed for the drift unit test.
 */
export function scanAttendanceSchema(rawSql: string): AttendanceSchemaFacts {
    const sql = stripSqlComments(rawSql);
    return {
        appendOnlyTrigger: appendOnlyTriggerPresent(sql, "trg_prevent_child_attendance_events_mutation"),
        entryTypeCheck: namedCheckConstraintPresent(sql, "child_attendance_events_entry_type_check"),
        correctsSelfFk: selfRefFkPresent(sql, ATTENDANCE_TABLE, "corrects_event_id"),
        noSelfRef: namedCheckConstraintPresent(sql, "child_attendance_events_no_self_reference"),
        orgSelectPolicy: policyPresent(sql, "child_attendance_events_select_org"),
        hasUpdatedAt: hasUpdatedAtColumn(sql, ATTENDANCE_TABLE),
    };
}

/** Read + concatenate (chronological) every migration that touches the attendance table. */
export function readAttendanceMigrationsOrdered(): { concatenated: string; files: string[] } {
    return readMigrationsOrderedTouching(ATTENDANCE_TABLE);
}
