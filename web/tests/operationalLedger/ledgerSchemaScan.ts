/**
 * Shared cumulative-schema scan mechanics for append-only ledgers (TEST INFRA).
 *
 * The SINGLE generic migration-scanner used by every ledger conformance test, so
 * there is never a second copy of "created and not subsequently dropped over the
 * cumulative history" logic that could drift:
 *   - Operational Facts    → tests/operationalFacts/attendanceSchemaScan.ts
 *   - Operational Expectations → tests/operationalExpectations/expectationLedgerSchemaScan.ts
 *
 * Each ledger's scanner is a THIN wrapper that names its own table/trigger/policy/
 * constraint tokens and calls these primitives. No product code — pure test
 * scaffolding over migration SQL text.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** repo-root/supabase/migrations, resolved from web/tests/<area>/. */
export const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");

/** Index of the LAST match of `re` in `text`, or -1. */
export function lastPos(text: string, re: RegExp): number {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let idx = -1;
    for (let m = g.exec(text); m; m = g.exec(text)) idx = m.index;
    return idx;
}

/** "present" = last CREATE/ADD occurs after last DROP/REMOVE (or there is no drop). */
export function createdNotDropped(text: string, createRe: RegExp, dropRe: RegExp): boolean {
    const c = lastPos(text, createRe);
    if (c < 0) return false;
    const d = lastPos(text, dropRe);
    return c > d;
}

/** Strip block + line SQL comments so a how-to/rollback COMMENT never reads as DDL. */
export function stripSqlComments(rawSql: string): string {
    return rawSql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The named table's OWN `CREATE TABLE ( ... )` column block, or null. */
export function createTableBlock(sql: string, table: string): string | null {
    const re = new RegExp(
        `CREATE\\s+TABLE[^(]*?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)\\s*;`,
        "i",
    );
    const m = sql.match(re);
    return m ? m[1] : null;
}

/** True iff the table's OWN create block declares column `col`. */
export function columnInCreateBlock(sql: string, table: string, col: string): boolean {
    const block = createTableBlock(sql, table);
    if (!block) return false;
    // A column declaration: name at line start (not inside a CONSTRAINT line).
    return new RegExp(`(^|\\n)\\s*${col}\\s+[a-z]`, "i").test(block);
}

/** The column names declared in the table's own create block. */
export function createBlockColumnNames(sql: string, table: string): string[] {
    const block = createTableBlock(sql, table);
    if (!block) return [];
    const names: string[] = [];
    for (const line of block.split("\n")) {
        const m = line.match(
            /^\s*([a-z_][a-z0-9_]*)\s+(uuid|text|jsonb|integer|timestamptz|boolean|date|numeric)\b/i,
        );
        if (m) names.push(m[1].toLowerCase());
    }
    return names;
}

/**
 * An append-only mutation-block trigger is present. The DROP guard excludes a
 * same-statement DROP-then-CREATE (re-create) so a migration's own idempotent
 * `DROP TRIGGER IF EXISTS ...; CREATE TRIGGER ...` reads as present.
 */
export function appendOnlyTriggerPresent(sql: string, triggerName: string): boolean {
    return createdNotDropped(
        sql,
        new RegExp(`CREATE\\s+TRIGGER\\s+${triggerName}\\b`, "i"),
        new RegExp(
            `DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${triggerName}\\b(?![^;]*;\\s*CREATE\\s+TRIGGER)`,
            "i",
        ),
    );
}

/**
 * A named CHECK constraint is present. The create match anchors on the DEFINITION
 * form (`CONSTRAINT <name> ... CHECK`), which the `DROP CONSTRAINT <name>` form
 * lacks — so a later DROP is not mistaken for a (re-)definition.
 */
export function namedCheckConstraintPresent(sql: string, name: string): boolean {
    return createdNotDropped(
        sql,
        new RegExp(`CONSTRAINT\\s+${name}\\s+CHECK`, "i"),
        new RegExp(`DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?${name}\\b`, "i"),
    );
}

/** A self-referential FK column (`<col> uuid REFERENCES public.<table>`) is present. */
export function selfRefFkPresent(sql: string, table: string, col: string): boolean {
    return createdNotDropped(
        sql,
        new RegExp(`${col}\\s+uuid\\s+REFERENCES\\s+public\\.${table}`, "i"),
        new RegExp(`DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?${col}\\b`, "i"),
    );
}

/** A named RLS SELECT policy is present. */
export function policyPresent(sql: string, policyName: string): boolean {
    return createdNotDropped(
        sql,
        new RegExp(`(?:CREATE\\s+POLICY\\s+)${policyName}\\b`, "i"),
        new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?${policyName}\\b`, "i"),
    );
}

/**
 * The table has an updated_at column (positive-drift signal): declared in its own
 * create block, or added by a later ALTER and not subsequently dropped.
 */
export function hasUpdatedAtColumn(sql: string, table: string): boolean {
    const altered = createdNotDropped(
        sql,
        new RegExp(
            `ALTER\\s+TABLE\\s+(?:public\\.)?${table}[\\s\\S]{0,200}?ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?updated_at"?`,
            "i",
        ),
        new RegExp(
            `ALTER\\s+TABLE\\s+(?:public\\.)?${table}[\\s\\S]{0,200}?DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?"?updated_at"?`,
            "i",
        ),
    );
    return altered || columnInCreateBlock(sql, table, "updated_at");
}

/**
 * The union of table-level privileges GRANTed to `role` across all GRANT
 * statements for `table` (lower-cased; "ALL" expands to select/insert/update/
 * delete). Later REVOKEs are not modelled (migrations here only GRANT).
 */
export function tableGrantsTo(sql: string, table: string, role: string): Set<string> {
    const granted = new Set<string>();
    const re = new RegExp(
        `GRANT\\s+([A-Z,\\s]+?)\\s+ON\\s+TABLE\\s+(?:public\\.)?${table}\\s+TO\\s+${role}\\b`,
        "gi",
    );
    for (let m = re.exec(sql); m; m = re.exec(sql)) {
        for (const priv of m[1].split(",")) {
            const p = priv.trim().toLowerCase();
            if (!p) continue;
            if (p === "all") ["select", "insert", "update", "delete"].forEach((x) => granted.add(x));
            else granted.add(p);
        }
    }
    return granted;
}

/** True iff `role` is GRANTed `privilege` (or ALL) on `table`. */
export function grantsPrivilegeTo(sql: string, table: string, privilege: string, role: string): boolean {
    return tableGrantsTo(sql, table, role).has(privilege.toLowerCase());
}

/**
 * True iff a live (not later-dropped) `CREATE POLICY … ON <table> FOR INSERT …
 * TO <role>` exists. A `FOR ALL` policy is intentionally NOT counted as an INSERT
 * policy here — callers audit the explicit INSERT surface separately from the
 * service_role FOR ALL infrastructure policy.
 */
export function insertPolicyForRolePresent(sql: string, table: string, role: string): boolean {
    // Find every CREATE POLICY block for the table, then test each for FOR INSERT + TO role.
    const blockRe = new RegExp(
        `CREATE\\s+POLICY\\s+([a-z0-9_]+)\\s+ON\\s+(?:public\\.)?${table}([\\s\\S]*?);`,
        "gi",
    );
    for (let m = blockRe.exec(sql); m; m = blockRe.exec(sql)) {
        const name = m[1];
        const body = m[2];
        if (/FOR\s+INSERT\b/i.test(body) && new RegExp(`TO\\s+${role}\\b`, "i").test(body)) {
            // Ensure it isn't dropped afterwards.
            const dropRe = new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?${name}\\b`, "i");
            if (lastPos(sql, dropRe) < (m.index ?? 0)) return true;
        }
    }
    return false;
}

/** True iff a plpgsql function body assigns `NEW.<col> := now()` (server-assigned). */
export function columnServerAssignedNow(sql: string, col: string): boolean {
    return new RegExp(`NEW\\.${col}\\s*:=\\s*now\\(\\)`, "i").test(sql);
}

/** Read + concatenate (chronological) every migration whose SQL mentions `table`. */
export function readMigrationsOrderedTouching(
    table: string,
): { concatenated: string; files: string[] } {
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort(); // filename == timestamp prefix == chronological
    const touching: string[] = [];
    const parts: string[] = [];
    for (const f of files) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
        if (sql.includes(table)) {
            touching.push(f);
            parts.push(`-- ${f}\n${sql}`);
        }
    }
    return { concatenated: parts.join("\n"), files: touching };
}
