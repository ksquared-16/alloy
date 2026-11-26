import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    BILLABLE_SOURCE_TYPES,
    CHARGE_CATEGORIES,
} from "@/lib/financials/billableSource";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260630120000_financial_substrate_generalization_p3_1.sql"
);

/** The whole tree, so a vocabulary lock can DISCOVER rather than enumerate. */
const migrationsDir = dirname(migrationPath);

describe("P3.1 financial substrate generalization migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("adds additive charge_category without touching legacy charge_type CHECK", () => {
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS charge_category text");
        expect(sql).toContain("charges_charge_category_chk");
        for (const cat of CHARGE_CATEGORIES) {
            expect(sql).toContain(`'${cat}'::text`);
        }
        // Legacy charge_type vocabulary / CHECK must be left frozen (not redefined).
        expect(sql).not.toContain("charges_charge_type_chk");
        expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.charges[\s\S]*?charge_type\s*=\s*ANY/i);
    });

    it("adds the generic billable-source dimension on all three substrate tables", () => {
        for (const tbl of ["charges", "ledger_transactions", "gl_journal_lines"]) {
            expect(sql).toContain(`ALTER TABLE public.${tbl}`);
        }
        // columns
        const cols = sql.match(/ADD COLUMN IF NOT EXISTS billable_source_type text/g) ?? [];
        expect(cols.length).toBe(3);
        const idCols = sql.match(/ADD COLUMN IF NOT EXISTS billable_source_id uuid/g) ?? [];
        expect(idCols.length).toBe(3);
        /*
         * VOCABULARY IS DISCOVERED ACROSS THE TREE, not pinned to this one file.
         *
         * This asserted that P3.1 itself contained every value in `BILLABLE_SOURCE_TYPES`. That was
         * true only while the vocabulary never grew — and the moment `customer` was added to close
         * HOUSEHOLD_BILLABLE_SOURCE, the lock demanded a HISTORICAL migration be edited to contain a
         * value it never wrote. Rewriting a shipped migration to satisfy a test is the one thing a
         * migration lock must never encourage.
         *
         * So: P3.1 owns the two kinds it introduced, and the code vocabulary must be satisfied by the
         * migration tree as a whole. An unbacked value still fails — it simply is not required to be
         * in this file.
         */
        for (const t of ["job", "enrollment_agreement"]) {
            expect(sql, `P3.1 must still declare '${t}'`).toContain(`'${t}'::text`);
        }
        const tree = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
            .join("\n");
        for (const t of BILLABLE_SOURCE_TYPES) {
            expect(tree, `no migration declares billable source '${t}'`).toContain(`'${t}'::text`);
        }
    });

    it("relaxes the job anchor and backfills existing rows to the job source", () => {
        expect(sql).toContain("ALTER COLUMN job_id DROP NOT NULL");
        expect(sql).toContain("SET billable_source_type = 'job', billable_source_id = job_id");
        expect(sql).toContain("charges_source_present_chk");
    });

    it("does NOT create a second ledger or a childcare-specific ledger/GL table", () => {
        expect(sql).not.toMatch(/CREATE TABLE[^;]*ledger/i);
        expect(sql).not.toMatch(/CREATE TABLE[^;]*childcare_(charges|ledger|gl)/i);
    });

    it("enforces childcare posted-charge immutability via trigger scoped to enrollment_agreement", () => {
        expect(sql).toContain("FUNCTION public.enforce_childcare_charge_immutability()");
        expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.charges");
        expect(sql).toContain("billable_source_type = 'enrollment_agreement'");
        expect(sql).toContain("OLD.status <> 'draft'");
        // financial fields are frozen once posted
        expect(sql).toContain("NEW.amount_cents IS DISTINCT FROM OLD.amount_cents");
        expect(sql).toContain("source_charge_id");
    });

    it("role-gates childcare financial writes via RESTRICTIVE policies (jobs unaffected)", () => {
        const gates = sql.match(/AS RESTRICTIVE FOR ALL TO authenticated/g) ?? [];
        expect(gates.length).toBeGreaterThanOrEqual(1);
        expect(sql).toContain("childcare_write_rolegate");
        // Built via format(); single quotes are doubled in the literal SQL string.
        expect(sql).toContain("has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])");
        expect(sql).toContain("billable_source_type IS DISTINCT FROM ''enrollment_agreement''");
    });

    it("does not reference job-vertical scheduling/pricing tables it must avoid", () => {
        expect(sql).not.toContain("schedule_assignments");
        expect(sql).not.toContain("job_pricing");
        expect(sql).not.toContain("subscriptions");
    });
});
