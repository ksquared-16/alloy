import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260716130000_processing_identity_b2_facts.sql",
);

describe("processing identity B2 facts migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("creates processing_facts with immutability trigger", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_facts");
        expect(sql).toContain("processing_facts_immutable_guard");
        expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.processing_facts");
    });

    it("scopes RLS with has_org_role", () => {
        expect(sql).toContain("processing_facts_select_org");
        expect(sql).toContain("has_org_role(org_id");
    });

    it("extends processing_cases and processing_case_sources foundation columns", () => {
        expect(sql).toContain("retention_class");
        expect(sql).toContain("idempotency_key");
        expect(sql).toContain("uq_pcs_org_idempotency_key");
    });
});

const b3Path = resolve(
    __dirname,
    "../../../supabase/migrations/20260716140000_processing_identity_b3_resolutions.sql",
);

describe("processing identity B3 resolutions migration", () => {
    const sql = readFileSync(b3Path, "utf8");

    it("creates processing_resolutions with governed JSON columns", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_resolutions");
        expect(sql).toContain("candidates jsonb");
        expect(sql).toContain("uq_processing_resolutions_case_subject_generation");
    });

    it("supports staleness via superseded_by", () => {
        expect(sql).toContain("stale_at");
        expect(sql).toContain("superseded_by");
    });
});
