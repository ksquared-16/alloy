import { describe, expect, it } from "vitest";

import {
    opportunityBodyHasCustomFieldUpdates,
    OPPORTUNITY_PATCH_NATIVE_KEYS,
} from "@/lib/admin/drawer/opportunityDrawerFieldSave";

describe("opportunityDrawerFieldSave", () => {
    it("detects custom field_values-only PATCH bodies", () => {
        expect(
            opportunityBodyHasCustomFieldUpdates({
                inquiry_source: "website",
            })
        ).toBe(true);
        expect(
            opportunityBodyHasCustomFieldUpdates({
                start_date: "2026-09-01",
            })
        ).toBe(true);
    });

    it("does not treat native opportunity keys as custom-only", () => {
        expect(opportunityBodyHasCustomFieldUpdates({ source: "referral" })).toBe(false);
        expect(OPPORTUNITY_PATCH_NATIVE_KEYS.has("external_source")).toBe(true);
        expect(OPPORTUNITY_PATCH_NATIVE_KEYS.has("inquiry_source")).toBe(false);
    });
});
