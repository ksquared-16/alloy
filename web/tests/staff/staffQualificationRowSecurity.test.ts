/**
 * RLS IS THE ONLY BOUNDARY THESE TABLES HAVE.
 *
 * `pg_default_acl` on the `public` schema carries
 *   postgres | public | r | {..., authenticated=r/postgres, ...}
 * so every table a migration creates in `public` is granted SELECT to
 * `authenticated` the instant it exists — with no GRANT anywhere in the
 * migration. Nothing in the file tells you that, which is exactly why it was
 * missed.
 *
 * MEASURED, not theorised. After the first certification apply the four Slice 3
 * tables carried RLS = false, zero policies, and `authenticated` holding SELECT:
 * every staff credential in every organization was readable through PostgREST by
 * any authenticated user of any tenant. Of the 296 authenticated-readable tables
 * in `public`, 290 enable RLS. These four were four of the six that did not.
 *
 * This lock reads the migration rather than a live database on purpose: the
 * defect is a missing STATEMENT, it must fail in CI with no stack running, and a
 * database that happens to be correct today says nothing about what the file
 * will do to the next environment it is applied to.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(
    __dirname,
    "../../../supabase/migrations/20260926120000_staff_qualifications_v1.sql",
);

const SLICE_3_TABLES = [
    "staff_qualification_types",
    "staff_qualifications",
    "staff_qualification_evidence",
    "staff_qualification_requirements",
] as const;

/** Comments describe intent; only statements change a database. */
function statementsOnly(sql: string): string {
    return sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
}

describe("Slice 3 qualification tables declare row level security", () => {
    const sql = statementsOnly(readFileSync(MIGRATION, "utf8"));

    it.each(SLICE_3_TABLES)("%s enables RLS", (table) => {
        const enable = new RegExp(
            `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
            "i",
        );
        expect(
            enable.test(sql),
            `${table} is granted SELECT to 'authenticated' by the schema's default privileges. `
                + "Without ENABLE ROW LEVEL SECURITY it is readable across every organization.",
        ).toBe(true);
    });

    it("every table is covered by the policy loop, and the loop covers nothing else", () => {
        // The policies are created in a FOREACH over an array literal, so the
        // array IS the coverage. Asserting membership catches a table added to
        // the migration later and not added here — the shape the original defect
        // would take on its second occurrence.
        const loop = /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]/i.exec(sql);
        expect(loop, "the policy loop should still be an array literal").not.toBeNull();
        const named = [...loop![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
        expect(named.sort()).toEqual([...SLICE_3_TABLES].sort());
    });

    it("read is broader than write, matching employments", () => {
        // employments: read owner/admin/ops/manager, write owner/admin/ops. A
        // qualification hangs off an employment, so a boundary that disagreed
        // would be the weaker of the two everywhere the two meet.
        expect(sql).toMatch(
            /FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*has_org_role\(org_id,\s*ARRAY\['owner','admin','ops','manager'\]\)/i,
        );
        for (const cmd of ["INSERT", "UPDATE", "DELETE"]) {
            expect(
                new RegExp(`FOR\\s+${cmd}\\s+TO\\s+authenticated`, "i").test(sql),
                `${cmd} needs an operator-scoped policy`,
            ).toBe(true);
        }
        // `manager` must NOT appear in any write predicate.
        const writeClauses = sql.match(/FOR\s+(?:INSERT|UPDATE|DELETE)[\s\S]*?\$f\$/gi) ?? [];
        expect(writeClauses.length).toBeGreaterThan(0);
        for (const clause of writeClauses) {
            expect(clause).not.toMatch(/manager/i);
        }
    });

    it("stays re-runnable — every policy is dropped before it is created", () => {
        const drops = (sql.match(/DROP\s+POLICY\s+IF\s+EXISTS/gi) ?? []).length;
        const creates = (sql.match(/CREATE\s+POLICY/gi) ?? []).length;
        // A failed apply does not roll back DDL, so this file must survive being
        // run twice against the same database.
        expect(drops).toBe(creates);
    });
});
