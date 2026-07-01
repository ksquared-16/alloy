import { describe, expect, it } from "vitest";
import {
    applyLocationDrawerPresentation,
    locationCustomContentKeysForKind,
} from "@/lib/admin/location/locationDrawerPresentation";

const baseSections = [
    {
        key: "overview",
        title: "Overview",
        fields: [
            { key: "label" },
            { key: "location_type" },
            { key: "address1" },
            { key: "beds" },
            { key: "has_pets" },
        ],
    },
    { key: "custom_property_fields", title: "Custom", fields: [] },
    { key: "customer", title: "Customer", fields: [] },
    { key: "relationships", title: "Relationships", fields: [] },
] as Parameters<typeof applyLocationDrawerPresentation>[0];

describe("locationDrawerPresentation", () => {
    it("builds site-specific sections without duplicating header context fields", () => {
        const out = applyLocationDrawerPresentation(baseSections, "site");
        expect(out.map((s) => s.key)).toEqual(["location_site_details", "location_address"]);
        expect(out[0]?.fields?.some((f) => f.key === "director_name")).toBe(true);
        expect(out[0]?.fields?.some((f) => f.key === "location_type")).toBe(false);
        expect(out[1]?.fields?.some((f) => f.key === "address1")).toBe(true);
    });

    it("builds unit room details with parent site link and paired metadata rows", () => {
        const out = applyLocationDrawerPresentation(baseSections, "unit");
        expect(out.map((s) => s.key)).toEqual(["location_unit_details"]);
        const fields = out[0]?.fields ?? [];
        expect(fields.some((f) => f.key === "category")).toBe(true);
        expect(fields.some((f) => f.key === "parent_location_id" && f.linkTarget?.idField === "parent_location_id")).toBe(
            true
        );
        expect(fields.some((f) => f.key === "age_range_from")).toBe(true);
        expect(fields.some((f) => f.key === "age_range_to")).toBe(true);
        expect(fields.some((f) => f.key === "age_range_unit")).toBe(true);
        expect(fields.some((f) => f.key === "capacity")).toBe(true);
        expect(fields.some((f) => f.key === "student_teacher_ratio")).toBe(true);
        expect(out[0]?.gridCols).toBe(3);
    });

    it("suppresses operator custom sections for site and unit kinds", () => {
        expect(locationCustomContentKeysForKind("site")).toEqual({
            customer: false,
            relationships: false,
            custom_property_fields: false,
        });
    });
});
