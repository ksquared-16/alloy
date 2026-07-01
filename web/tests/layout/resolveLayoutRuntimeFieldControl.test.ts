import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("layout runtime placement select wiring", () => {
    it("LayoutRuntimePlanView uses LayoutRuntimeFieldInput for editable fields", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(src).toContain("LayoutRuntimeFieldInput");
        expect(src).not.toMatch(/canEdit && edit \?[\s\S]*<input[\s\S]*type="text"/);
    });

    it("placement option_source migration wires cascade metadata", () => {
        const sql = readFileSync(
            resolve(__dirname, "../../../supabase/migrations/20260610130000_inquiry_child_placement_option_source.sql"),
            "utf8",
        );
        expect(sql).toContain("programs_for_location");
        expect(sql).toContain("rooms_for_location_program");
        expect(sql).toContain('"option_source":"locations"');
    });
});
