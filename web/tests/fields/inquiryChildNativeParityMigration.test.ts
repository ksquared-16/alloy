import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { allInquiryChildManifestFieldKeys } from "@/lib/fields/inquiryChildFieldParity";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260607120000_inquiry_child_native_parity_fc15.sql",
);

describe("FC-1.5 inquiry_child native parity migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("seeds all seven canonical inquiry_child native field keys for all orgs", () => {
        for (const key of allInquiryChildManifestFieldKeys()) {
            expect(sql).toContain(`'${key}'`);
        }
    });

    it("is idempotent (INSERT … WHERE NOT EXISTS)", () => {
        expect(sql).toContain("WHERE NOT EXISTS");
        expect(sql).toMatch(/INSERT INTO public\.field_definitions/);
        expect(sql).toMatch(/INSERT INTO public\.field_section_definitions/);
    });

    it("uses inquiry_child entity_type and inquiry_participation section", () => {
        expect(sql).toContain("'inquiry_child'");
        expect(sql).toContain("'inquiry_participation'");
    });
});
