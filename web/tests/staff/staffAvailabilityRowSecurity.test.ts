/**
 * RLS IN THE CREATING MIGRATION, NOT A FOLLOW-UP.
 *
 * Slice 3 shipped four tables with RLS disabled. `pg_default_acl` on this schema
 * grants `authenticated` SELECT on every new table in `public`, with no GRANT in
 * any migration, so every staff credential in every organization was readable
 * until mounted certification caught it. Nothing in a migration file hints at
 * that, which is exactly why it has to be locked rather than remembered.
 *
 * This reads the MIGRATION, not a live database: the defect is a missing
 * statement, it must fail in CI with no stack running, and a database that
 * happens to be correct today says nothing about the next environment this file
 * is applied to.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(
    __dirname,
    "../../../supabase/migrations/20260927120000_staff_availability_v1.sql",
);

const SLICE_4_TABLES = ["staff_availability_windows", "staff_availability_exceptions"] as const;

/** Comments describe intent; only statements change a database. */
function statementsOnly(sql: string): string {
    return sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
}

describe("Slice 4 availability tables ship with row level security", () => {
    const sql = statementsOnly(readFileSync(MIGRATION, "utf8"));

    it.each(SLICE_4_TABLES)("%s enables RLS in the file that creates it", (table) => {
        expect(
            new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(sql),
            `${table} is granted SELECT to 'authenticated' by the schema's default privileges. `
                + "Without ENABLE ROW LEVEL SECURITY it is readable across every organization.",
        ).toBe(true);
    });

    it("the policy loop covers exactly these tables", () => {
        const loop = /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]/i.exec(sql);
        expect(loop, "the policy loop should be an array literal").not.toBeNull();
        const named = [...loop![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
        expect(named.sort()).toEqual([...SLICE_4_TABLES].sort());
    });

    it("read is broader than write, matching employments", () => {
        expect(sql).toMatch(
            /FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*has_org_role\(org_id,\s*ARRAY\['owner','admin','ops','manager'\]\)/i,
        );
        const writes = sql.match(/FOR\s+(?:INSERT|UPDATE|DELETE)[\s\S]*?\$f\$/gi) ?? [];
        expect(writes.length).toBeGreaterThan(0);
        for (const clause of writes) expect(clause).not.toMatch(/manager/i);
    });

    it("carries org_id and an employment FK — the grain is structural, not conventional", () => {
        for (const table of SLICE_4_TABLES) {
            const body = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}([\\s\\S]*?)\\n\\);`).exec(sql);
            expect(body, `${table} should be created in this migration`).not.toBeNull();
            expect(body![1]).toMatch(/org_id uuid NOT NULL REFERENCES public\.orgs/);
            // Employment, never Person: one human can work for two organizations with
            // different availability at each.
            expect(body![1]).toMatch(/employment_id uuid NOT NULL REFERENCES public\.employments/);
            expect(body![1]).not.toMatch(/person_id/);
        }
    });

    it("stays re-runnable — every policy is dropped before it is created", () => {
        const drops = (sql.match(/DROP\s+POLICY\s+IF\s+EXISTS/gi) ?? []).length;
        const creates = (sql.match(/CREATE\s+POLICY/gi) ?? []).length;
        expect(drops).toBe(creates);
    });
});
