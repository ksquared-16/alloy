/**
 * QA fixture SQL against the MIGRATED schema — not against itself.
 *
 * The Documents R5 shared-child ensure (and its rollback invariant) inserted `customers.status`, a column the canonical
 * migration 20260625140100_canonical_drop_legacy_status_columns.sql had dropped months earlier. Every byte-level test
 * passed, because they compared the fixture with its own invariant. The hosted run then failed on the first INSERT
 * (gar_bbbdf3ca3762f2, rolled back). This suite derives each table's columns from `supabase/migrations` in order —
 * CREATE TABLE (including the remote_schema dump), ADD / DROP / RENAME COLUMN, SET / DROP NOT NULL, SET DEFAULT — and
 * checks every write these fixtures make:
 *   - every inserted column exists after the last migration;
 *   - every NOT NULL column with no default is supplied, or assigned by a BEFORE INSERT trigger the migrations define
 *     (`NEW.<col> :=` in a trigger function attached to that table);
 *   - every column a DELETE / SELECT filters a fixture table on exists.
 * No database: this is the migration record, so a schema change made outside migrations is not seen — that half
 * stays the isolated-environment rollback invariant's job (not run here).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const FIXTURE_FILES = [
    "certification/fixtures/qa-documents-shared-child-ensure.sql",
    "certification/fixtures/qa-documents-shared-child-reset.sql",
    "certification/invariants/documents-r5-shared-child-fixture.sql",
    "certification/qa-shared/documents-r5-shared-child-residue-census.sql",
];

type Col = { notNull: boolean; hasDefault: boolean };
type Schema = Map<string, Map<string, Col>>;

const ID = String.raw`"?([a-z_][a-z0-9_]*)"?`;
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");

/** Columns of every public table after all migrations, in file order. */
function migratedSchema(): { tables: Schema; triggerAssigned: Map<string, Set<string>> } {
    const tables: Schema = new Map();
    const fnAssigns = new Map<string, Set<string>>();
    const tableTriggerFns = new Map<string, Set<string>>();
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
        const s = stripComments(readFileSync(join(MIGRATIONS, f), "utf8"));
        for (const m of s.matchAll(new RegExp(String.raw`CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?${ID}\s*\(([\s\S]*?)\n\s*\)\s*;`, "gi"))) {
            const cols = new Map<string, Col>();
            for (const raw of m[2].split(/,\s*\n/)) {
                const line = raw.trim();
                const cm = line.match(new RegExp(String.raw`^${ID}\s+(\S[\s\S]*)$`, "i"));
                if (!cm) continue;
                const name = cm[1].toLowerCase();
                if (["constraint", "primary", "unique", "check", "foreign", "exclude"].includes(name)) continue;
                cols.set(name, {
                    notNull: /not null|primary key/i.test(cm[2]),
                    hasDefault: /\bdefault\b|\bgenerated\b/i.test(cm[2]),
                });
            }
            tables.set(m[1].toLowerCase(), cols);
        }
        for (const m of s.matchAll(new RegExp(String.raw`ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:ONLY )?(?:"?public"?\.)?${ID}\s+([\s\S]*?);`, "gi"))) {
            const cols = tables.get(m[1].toLowerCase());
            if (!cols) continue;
            const body = m[2];
            for (const a of body.matchAll(new RegExp(String.raw`ADD COLUMN (?:IF NOT EXISTS )?${ID}\s+([^,]*)`, "gi"))) {
                cols.set(a[1].toLowerCase(), { notNull: /not null/i.test(a[2]), hasDefault: /\bdefault\b/i.test(a[2]) });
            }
            for (const a of body.matchAll(new RegExp(String.raw`DROP COLUMN (?:IF EXISTS )?${ID}`, "gi"))) cols.delete(a[1].toLowerCase());
            for (const a of body.matchAll(new RegExp(String.raw`RENAME COLUMN ${ID} TO ${ID}`, "gi"))) {
                const v = cols.get(a[1].toLowerCase());
                cols.delete(a[1].toLowerCase());
                if (v) cols.set(a[2].toLowerCase(), v);
            }
            for (const a of body.matchAll(new RegExp(String.raw`ALTER COLUMN ${ID} SET NOT NULL`, "gi"))) { const c = cols.get(a[1].toLowerCase()); if (c) c.notNull = true; }
            for (const a of body.matchAll(new RegExp(String.raw`ALTER COLUMN ${ID} DROP NOT NULL`, "gi"))) { const c = cols.get(a[1].toLowerCase()); if (c) c.notNull = false; }
            for (const a of body.matchAll(new RegExp(String.raw`ALTER COLUMN ${ID} SET DEFAULT`, "gi"))) { const c = cols.get(a[1].toLowerCase()); if (c) c.hasDefault = true; }
        }
        // Trigger functions and what they assign; later definitions replace earlier ones.
        for (const m of s.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi)) {
            fnAssigns.set(m[1].toLowerCase(), new Set([...m[3].matchAll(/\bNEW\.([a-z_][a-z0-9_]*)\s*:=/gi)].map((x) => x[1].toLowerCase())));
        }
        for (const m of s.matchAll(/CREATE (?:OR REPLACE )?TRIGGER\s+\S+\s+BEFORE\s+INSERT[\s\S]*?ON (?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?[\s\S]*?EXECUTE (?:FUNCTION|PROCEDURE) (?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
            const t = m[1].toLowerCase();
            if (!tableTriggerFns.has(t)) tableTriggerFns.set(t, new Set());
            tableTriggerFns.get(t)!.add(m[2].toLowerCase());
        }
    }
    const triggerAssigned = new Map<string, Set<string>>();
    for (const [t, fns] of tableTriggerFns) {
        const cols = new Set<string>();
        for (const fn of fns) for (const c of fnAssigns.get(fn) ?? []) cols.add(c);
        triggerAssigned.set(t, cols);
    }
    return { tables, triggerAssigned };
}

type Problem = { table: string; column: string; kind: "unknown_table" | "missing_column" | "required_not_supplied" | "filter_column_missing" };

/** The writes and filters one SQL file makes on public tables, checked against the migrated schema. */
function checkSql(sql: string, schema: ReturnType<typeof migratedSchema>): Problem[] {
    const s = stripComments(sql);
    const out: Problem[] = [];
    for (const m of s.matchAll(/insert into (?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
        const table = m[1].toLowerCase();
        const cols = schema.tables.get(table);
        if (!cols) { out.push({ table, column: "*", kind: "unknown_table" }); continue; }
        const given = m[2].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase()).filter(Boolean);
        for (const c of given) if (!cols.has(c)) out.push({ table, column: c, kind: "missing_column" });
        const assigned = schema.triggerAssigned.get(table) ?? new Set<string>();
        for (const [c, def] of cols) {
            if (def.notNull && !def.hasDefault && !given.includes(c) && !assigned.has(c)) out.push({ table, column: c, kind: "required_not_supplied" });
        }
    }
    // Single-table DELETE / SELECT filters: `<delete from|from> public.t [alias] where …`. String literals are blanked first
    // (messages like 'partial state is …' are not columns) and the clause ends at its first unbalanced `)`, `;`, or a
    // following ORDER BY / UNION, so an outer query's WHERE is never read as this table's.
    const code = s.replace(/'(?:[^']|'')*'/g, "''");
    for (const m of code.matchAll(/(?:delete\s+from|from)\s+public\.([a-z_][a-z0-9_]*)(?:\s+(?!where\b)([a-z_][a-z0-9_]*))?\s+where\s+/gi)) {
        const table = m[1].toLowerCase();
        const cols = schema.tables.get(table);
        if (!cols) { out.push({ table, column: "*", kind: "unknown_table" }); continue; }
        const alias = m[2]?.toLowerCase() ?? null;
        let depth = 0;
        let end = m.index! + m[0].length;
        for (; end < code.length; end++) {
            const ch = code[end];
            if (ch === "(") depth++;
            else if (ch === ")") { if (depth === 0) break; depth--; }
            else if (ch === ";" && depth === 0) break;
            else if (depth === 0 && /^\s(order\s+by|union|group\s+by|limit)\b/i.test(code.slice(end, end + 12))) break;
        }
        const clause = code.slice(m.index! + m[0].length, end);
        for (const f of clause.matchAll(/(?:^|[\s(])(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*(?:=|<>|!=|\bin\b|\bis\b|\blike\b)/gi)) {
            const qual = f[1]?.toLowerCase();
            if (qual && qual !== alias && qual !== table) continue; // another table's column
            const c = f[2].toLowerCase();
            if (["and", "or", "not", "exists", "select", "true", "false", "null"].includes(c)) continue;
            if (!cols.has(c)) out.push({ table, column: c, kind: "filter_column_missing" });
        }
    }
    return out;
}

const SCHEMA = migratedSchema();

describe("the migration-derived schema is the real one (sanity, so a broken parser cannot pass everything)", () => {
    it("knows the fixture tables and their current columns", () => {
        for (const t of ["customers", "customer_members", "work_units", "opportunities", "opportunity_customer_members", "process_instances"]) {
            expect(SCHEMA.tables.has(t), t).toBe(true);
        }
        const customers = SCHEMA.tables.get("customers")!;
        expect(customers.has("status"), "customers.status was dropped by 20260625140100").toBe(false);
        expect(customers.has("status_key")).toBe(true);
        expect(customers.size).toBeGreaterThan(10);
    });

    it("sees the record-number triggers, so trigger-assigned NOT NULL columns are not demanded from fixtures", () => {
        expect(SCHEMA.triggerAssigned.get("customers")?.has("customer_number")).toBe(true);
        expect(SCHEMA.triggerAssigned.get("opportunities")?.has("opportunity_number")).toBe(true);
    });
});

describe("negative controls: the checker catches the defect classes", () => {
    it("the exact pre-repair statement (gar_bbbdf3ca3762f2) is refused: customers.status no longer exists", () => {
        const before = "insert into public.customers (id, org_id, name, status, metadata) values (:'household'::uuid, :'org'::uuid, 'x', 'active', '{}'::jsonb);";
        expect(checkSql(before, SCHEMA)).toContainEqual({ table: "customers", column: "status", kind: "missing_column" });
    });

    it("a missing required column, an unknown table and a dropped filter column are each refused", () => {
        expect(checkSql("insert into public.customer_members (id, org_id, display_name) values (1,2,3);", SCHEMA))
            .toContainEqual({ table: "customer_members", column: "customer_id", kind: "required_not_supplied" });
        expect(checkSql("insert into public.no_such_table (id) values (1);", SCHEMA)).toContainEqual({ table: "no_such_table", column: "*", kind: "unknown_table" });
        expect(checkSql("delete from public.customers where org_id = :'org'::uuid and status = 'active';", SCHEMA))
            .toContainEqual({ table: "customers", column: "status", kind: "filter_column_missing" });
    });
});

describe("every Documents R5 shared-child fixture file matches the migrated schema", () => {
    for (const file of FIXTURE_FILES) {
        it(file, () => {
            expect(checkSql(readFileSync(resolve(ROOT, file), "utf8"), SCHEMA)).toEqual([]);
        });
    }
});
