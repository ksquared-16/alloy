import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("enrollment status matrix seed migration", () => {
    const sql = readFileSync(
        resolve(__dirname, "../../../supabase/migrations/20260610140000_enrollment_status_matrix_seed_metadata.sql"),
        "utf8",
    );

    it("is upsert-only (no deletes or renames)", () => {
        expect(sql.toLowerCase()).not.toContain("delete from");
        expect(sql.toLowerCase()).not.toMatch(/alter\s+table.*status_key/);
    });

    it("seeds doctrine disposition keys with alloy_layer metadata", () => {
        expect(sql).toContain("'alloy_layer', 'enrollment_disposition'");
        expect(sql).toContain("'needs_qualification'");
        expect(sql).toContain("'family_withdrew'");
        expect(sql).toContain("'decision_pending'");
        expect(sql).toContain("'alloy_layer', 'case_status'");
    });

    it("marks legacy keys deprecated without removing pipeline keys", () => {
        expect(sql).toContain("'legacy_case_pipeline'");
        expect(sql).toContain("'alias_of', 'family_withdrew'");
        expect(sql).not.toMatch(/is_active\s*=\s*false[\s\S]*new_inquiry/);
    });
});
