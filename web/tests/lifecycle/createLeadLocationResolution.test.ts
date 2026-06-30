import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";

const enrollmentLeadMetadata = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: { required_rule_ids: ["child:location"], recommended_rule_ids: [] },
        },
    },
};

const spec = resolveCreateLeadActionIntakeSpec({
    department_id: "dept-1",
    operator_stage: "lead",
    builder_stage_key: "lead",
    department_metadata: enrollmentLeadMetadata,
});

const LOCATION_OPTIONS = [
    { value: "site-south", label: "South Campus" },
    { value: "site-north", label: "North Campus" },
];

describe("Create Lead — free-text location resolves to the configured site (like a dropdown pick)", () => {
    it("resolves 'South Campus' to its configured location id when options are provided", () => {
        const result = parseCreateLeadIntakeText({
            text: ["Jordan Lee", "jordan.lee@test.com", "South Campus"].join("\n"),
            spec,
            field_options: { location_id: LOCATION_OPTIONS },
        });
        expect(result.fields.some((f) => f.value === "site-south")).toBe(true);
        expect(result.fields.some((f) => f.value === "site-north")).toBe(false);
    });

    it("does not fabricate a location id when the site is unknown / no options configured", () => {
        const result = parseCreateLeadIntakeText({
            text: ["Jordan Lee", "South Campus"].join("\n"),
            spec,
            field_options: { location_id: [] },
        });
        expect(result.fields.some((f) => f.value === "site-south")).toBe(false);
    });

    it("the modal feeds the parser canonical site options (bootstrap → hierarchy fallback), not raw bootstrap only", () => {
        // Regression guard for the actual fix: the dropdown's site options (with the locations-hierarchy
        // fallback) are what gets passed to the BOS parser, so free text resolves the same as a pick.
        const modal = readFileSync(
            resolve(__dirname, "../../components/admin/opportunity/actions/CreateLeadModal.tsx"),
            "utf8",
        );
        expect(modal).toContain("useInquiryChildPlacementCascade");
        expect(modal).toContain("placementSiteOptions");
        expect(modal).toMatch(/field_options:\s*\{\s*location_id:\s*locationOptions/);
    });
});
