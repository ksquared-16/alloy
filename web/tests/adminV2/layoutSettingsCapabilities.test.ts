import { describe, expect, it } from "vitest";
import { layoutSectionEditorCapability } from "@/lib/adminV2/layoutSettingsCapabilities";

describe("layoutSettingsCapabilities", () => {
    it("enables section editor for opportunity only", () => {
        const opp = layoutSectionEditorCapability("opportunity");
        expect(opp.supportsSectionOrder).toBe(true);
        expect(opp.supportsSectionVisibility).toBe(true);
        expect(opp.unavailableReason).toBeNull();

        const job = layoutSectionEditorCapability("job");
        expect(job.supportsSectionOrder).toBe(false);
        expect(job.unavailableReason).toContain("coming later");
    });
});
