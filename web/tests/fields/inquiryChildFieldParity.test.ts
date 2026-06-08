import { describe, expect, it } from "vitest";
import {
    allInquiryChildManifestFieldKeys,
    computeInquiryChildNativeParityGaps,
    REQUIRED_INQUIRY_CHILD_NATIVE_FIELD_KEYS,
} from "@/lib/fields/inquiryChildFieldParity";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";

describe("inquiryChildFieldParity", () => {
    it("manifest keys match required parity set (7/7)", () => {
        expect(REQUIRED_INQUIRY_CHILD_NATIVE_FIELD_KEYS).toEqual(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS);
        expect(allInquiryChildManifestFieldKeys()).toHaveLength(7);
    });

    it("reports no gaps when all native rows are present", () => {
        const rows = INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS.map((field_key) => ({
            field_key,
            entity_type: "inquiry_child",
            is_active: true,
        }));
        expect(computeInquiryChildNativeParityGaps(rows)).toEqual([]);
    });

    it("reports missing keys (Seed World / reference org parity contract)", () => {
        const rows = INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS.filter((k) => k !== "notes").map((field_key) => ({
            field_key,
            entity_type: "inquiry_child",
        }));
        expect(computeInquiryChildNativeParityGaps(rows)).toEqual(["notes"]);
    });

    it("ignores inactive or wrong entity_type rows", () => {
        const rows = INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS.map((field_key) => ({
            field_key,
            entity_type: field_key === "notes" ? "person" : "inquiry_child",
            is_active: field_key === "location_id" ? false : true,
        }));
        expect(computeInquiryChildNativeParityGaps(rows)).toEqual(["location_id", "notes"]);
    });
});
