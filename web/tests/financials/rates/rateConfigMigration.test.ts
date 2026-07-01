import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    BILLING_BASES,
    CALCULATION_STRATEGIES,
    RATE_BASES,
    SCHEDULE_BASES,
} from "@/lib/financials/rates/rateTypes";

const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260701120000_childcare_rate_plans_p3_2.sql"
);

describe("P3.2 rate plans migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("creates the two rate-config tables", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_rate_plans");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_rate_rules");
    });

    it("carries explicit currency on the plan only (rules inherit)", () => {
        expect(sql).toContain("currency_code text NOT NULL DEFAULT 'USD'");
        // rate_rules table must NOT declare its own currency column
        const rulesBlock = sql.slice(sql.indexOf("public.childcare_rate_rules"));
        expect(rulesBlock).not.toContain("currency_code");
    });

    it("defines schedule basis, rate basis, billing basis, and calc strategy vocab aligned with TS", () => {
        for (const b of SCHEDULE_BASES) expect(sql).toContain(`'${b}'::text`);
        for (const b of RATE_BASES) expect(sql).toContain(`'${b}'::text`);
        for (const b of BILLING_BASES) expect(sql).toContain(`'${b}'::text`);
        for (const s of CALCULATION_STRATEGIES) expect(sql).toContain(`'${s}'::text`);
    });

    it("reuses the shared org->site->program->room scope model + validation trigger", () => {
        expect(sql).toContain("scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])");
        expect(sql).toContain("childcare_rate_plans_scope_shape");
        expect(sql).toContain("validate_childcare_config_scope");
    });

    it("keeps proration/cadence as nullable hooks only", () => {
        expect(sql).toContain("proration_method text,");
        expect(sql).toContain("billing_cadence text,");
        expect(sql).toContain("proration_method IS NULL OR");
        expect(sql).toContain("billing_cadence IS NULL OR");
    });

    it("is effective-dated", () => {
        expect(sql).toContain("effective_start date NOT NULL");
        expect(sql).toContain("childcare_rate_plans_end_after_start");
        expect(sql).toContain("childcare_rate_rules_end_after_start");
    });

    it("role-gates writes via has_org_role (config posture)", () => {
        // built via format(); single quotes doubled in the literal SQL
        expect(sql).toContain("has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])");
    });

    it("does NOT write to or couple with the posting substrate or job tables", () => {
        // No DML against the posting substrate or anything else (pure config DDL).
        expect(sql).not.toMatch(/INSERT\s+INTO/i);
        expect(sql).not.toMatch(/UPDATE\s+public\.(charges|ledger_transactions|gl_journal_lines)/i);
        // No foreign keys to the posting substrate or job-vertical tables.
        expect(sql).not.toMatch(/REFERENCES\s+public\.(charges|ledger_transactions|gl_journal_lines|jobs|schedules|subscriptions)/i);
        // No job columns introduced.
        expect(sql).not.toMatch(/\bjob_id\b/);
        // Only the expected tables are referenced by FKs.
        const refs = [...sql.matchAll(/REFERENCES\s+public\.(\w+)/g)].map((m) => m[1]);
        const allowedRefs = new Set([
            "orgs",
            "locations",
            "location_program_categories",
            "childcare_rate_plans",
        ]);
        for (const r of refs) expect(allowedRefs.has(r)).toBe(true);
    });
});
