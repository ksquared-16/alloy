/**
 * Cumulative-schema scanner for the attendance fact stream (TEST INFRA — audit F3).
 *
 * The D2 conformance test must verify storage invariants against the CUMULATIVE
 * migration history, not a single frozen file: a LATER migration that drops the
 * append-only trigger or adds `updated_at` must flip the observed facts (and fail
 * conformance). This scans every migration touching `child_attendance_events`, in
 * chronological (filename) order, and resolves each invariant as "created and not
 * subsequently dropped".
 *
 * No product code — pure test scaffolding over the migration SQL text.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
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

/** Index of the LAST match of `re` in `text`, or -1. */
function lastPos(text: string, re: RegExp): number {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let idx = -1;
    for (let m = g.exec(text); m; m = g.exec(text)) idx = m.index;
    return idx;
}

/** True iff the attendance CREATE TABLE's OWN column block declares an updated_at column. */
function updatedAtInAttendanceCreateBlock(text: string): boolean {
    const m = text.match(
        /CREATE\s+TABLE[^(]*?child_attendance_events\s*\(([\s\S]*?)\n\s*\)\s*;/i,
    );
    return m ? /\bupdated_at\b/i.test(m[1]) : false;
}

/** "present" = last CREATE/ADD occurs after last DROP/REMOVE (or there is no drop). */
function createdNotDropped(text: string, createRe: RegExp, dropRe: RegExp): boolean {
    const c = lastPos(text, createRe);
    if (c < 0) return false;
    const d = lastPos(text, dropRe);
    return c > d;
}

/**
 * Resolve the cumulative attendance schema facts from ordered migration SQL.
 * `orderedSql` is the concatenation (in chronological order) of every migration
 * that mentions the attendance table. Exposed for the drift unit test.
 */
export function scanAttendanceSchema(rawSql: string): AttendanceSchemaFacts {
    // Strip SQL comments first — a rollback/how-to COMMENT (e.g. "DROP COLUMN
    // corrects_event_id" in a later migration's header) must never read as a real
    // schema change. We resolve invariants from executable DDL only.
    const orderedSql = rawSql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
    return {
        appendOnlyTrigger: createdNotDropped(
            orderedSql,
            /CREATE\s+TRIGGER\s+trg_prevent_child_attendance_events_mutation/i,
            /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?trg_prevent_child_attendance_events_mutation\b(?![^;]*;\s*CREATE\s+TRIGGER)/i,
        ),
        entryTypeCheck: createdNotDropped(
            orderedSql,
            /child_attendance_events_entry_type_check/i,
            /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?child_attendance_events_entry_type_check/i,
        ),
        correctsSelfFk: createdNotDropped(
            orderedSql,
            /corrects_event_id\s+uuid\s+REFERENCES\s+public\.child_attendance_events/i,
            /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?corrects_event_id/i,
        ),
        noSelfRef: createdNotDropped(
            orderedSql,
            /child_attendance_events_no_self_reference/i,
            /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?child_attendance_events_no_self_reference/i,
        ),
        orgSelectPolicy: createdNotDropped(
            orderedSql,
            /child_attendance_events_select_org/i,
            /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?child_attendance_events_select_org/i,
        ),
        // updated_at is a POSITIVE-drift signal: present if a migration adds it to the
        // table (in CREATE TABLE or via ALTER ADD COLUMN) and it is not later dropped.
        hasUpdatedAt: createdNotDropped(
            orderedSql,
            /ALTER\s+TABLE\s+(?:public\.)?child_attendance_events[\s\S]{0,200}?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?updated_at"?/i,
            /ALTER\s+TABLE\s+(?:public\.)?child_attendance_events[\s\S]{0,200}?DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?updated_at"?/i,
        )
        // also treat an updated_at column declared INSIDE the attendance CREATE TABLE
        // block as present — scoped to the table's own column list (up to its closing
        // paren) so a neighbouring table's updated_at cannot false-positive.
        || updatedAtInAttendanceCreateBlock(orderedSql),
    };
}

/** Read + concatenate (chronological) every migration that touches the attendance table. */
export function readAttendanceMigrationsOrdered(): { concatenated: string; files: string[] } {
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort(); // filename == timestamp prefix == chronological
    const touching: string[] = [];
    const parts: string[] = [];
    for (const f of files) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
        if (sql.includes(ATTENDANCE_TABLE)) {
            touching.push(f);
            parts.push(`-- ${f}\n${sql}`);
        }
    }
    return { concatenated: parts.join("\n"), files: touching };
}
