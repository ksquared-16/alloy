import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("commercial tuition rates migration idempotency", () => {
    const sql = readFileSync(
        resolve(__dirname, "../../../supabase/migrations/20260630120100_commercial_tuition_rates.sql"),
        "utf8",
    );

    it("guards column comments when v1 columns are absent", () => {
        expect(sql).toContain("information_schema.columns");
        expect(sql).toContain("column_name = 'program_key'");
        expect(sql).toContain("EXECUTE $comment$");
    });

    it("adds missing v1 columns idempotently before comments", () => {
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS program_key");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.commercial_tuition_rates");
    });

    it("preserves org-scoped RLS policies", () => {
        expect(sql).toContain("commercial_tuition_rates_select_org");
        expect(sql).toContain("has_org_role(org_id");
    });
});
