import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyLocationDrawerPresentation } from "@/lib/admin/location/locationDrawerPresentation";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Location drawer premium primitives", () => {
    it("LocationDrawerContextPanel uses shared record drawer primitives", () => {
        const src = read("components/admin/entity/LocationDrawerContextPanel.tsx");
        expect(src).toContain("RecordDrawerContextPanel");
        expect(src).toContain("RecordDrawerPremiumHeader");
        expect(src).not.toContain("LocationDrawerAboveFoldSnapshot");
    });

    it("drawer field labels come from field_definitions not parallel registry", () => {
        expect(read("lib/admin/location/locationDrawerPresentation.ts")).not.toContain(
            "locationRoomMetadataFieldRegistry"
        );
        const out = applyLocationDrawerPresentation([], "unit", [
            { field_key: "student_teacher_ratio", label: "Student:Teacher Ratio" },
        ]);
        const fields = out[0]?.fields ?? [];
        expect(fields.find((f) => f.key === "student_teacher_ratio")?.label).toBe("Student:Teacher Ratio");
    });

    it("LocationDrawerDeactivateAction uses RecordDrawerHeaderActionButton", () => {
        const src = read("components/admin/entity/LocationDrawerDeactivateAction.tsx");
        expect(src).toContain("RecordDrawerHeaderActionButton");
    });
});
