import { describe, expect, it } from "vitest";

import {
    FIELD_DEFINITION_ENTITY_TYPES,
    INQUIRY_CHILD_ENTITY_TYPE,
    INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS,
    inquiryChildDrawerShowsDesiredStart,
    isReservedInquiryChildFieldKey,
    partitionInquiryChildPatchBody,
    resolveInquiryChildDesiredStartDisplay,
} from "@/lib/fields/inquiryChildFieldRegistry";

describe("inquiryChildFieldRegistry", () => {
    it("includes inquiry_child in field definition entity types", () => {
        expect(FIELD_DEFINITION_ENTITY_TYPES).toContain(INQUIRY_CHILD_ENTITY_TYPE);
    });

    it("reserves native OCM field keys for custom field creation", () => {
        expect(isReservedInquiryChildFieldKey("desired_start_date")).toBe(true);
        expect(isReservedInquiryChildFieldKey("custom_note")).toBe(false);
        expect(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS).toContain("desired_start_date");
        expect(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS).toContain("location_id");
        expect(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS).toContain("program_room_cohort_key");
    });

    it("partitions PATCH body into native and custom keys", () => {
        const { native, custom } = partitionInquiryChildPatchBody({
            desired_start_date: "2026-09-01",
            allergy_notes: "peanuts",
        });
        expect(native.desired_start_date).toBe("2026-09-01");
        expect(custom.allergy_notes).toBe("peanuts");
    });

    it("resolveInquiryChildDesiredStartDisplay inherits from opportunity when OCM null", () => {
        const d = resolveInquiryChildDesiredStartDisplay(null, "2026-08-15");
        expect(d.inherited).toBe(true);
        expect(d.inputValue).toBe("2026-08-15");
        expect(d.storedValue).toBeNull();
    });

    it("resolveInquiryChildDesiredStartDisplay prefers stored OCM value", () => {
        const d = resolveInquiryChildDesiredStartDisplay("2026-10-01T00:00:00Z", "2026-08-15");
        expect(d.inherited).toBe(false);
        expect(d.storedValue).toBe("2026-10-01");
    });

    it("inquiryChildDrawerShowsDesiredStart respects visibility flag", () => {
        expect(
            inquiryChildDrawerShowsDesiredStart([
                { field_key: "desired_start_date", field_type: "date", label: "Desired start", is_visible_in_drawer: false },
            ])
        ).toBe(false);
    });

    it("native manifest uses Card 1 inquiry child labels and program-before-room order", async () => {
        const { INQUIRY_CHILD_NATIVE_FIELD_MANIFEST } = await import("@/lib/fields/inquiryChildFieldRegistry");
        const byKey = Object.fromEntries(INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.map((r) => [r.field_key, r]));
        expect(byKey.location_id?.label).toBe("Location");
        expect(byKey.program_room_cohort_key?.label).toBe("Room");
        expect(byKey.outcome_status_key?.label).toBe("Status");
        expect(byKey.desired_program_type?.sort_order).toBeLessThan(byKey.program_room_cohort_key?.sort_order ?? 0);
    });
});
