import { describe, expect, it } from "vitest";
import { brandingMetadataPatch, parseFormBranding } from "@/lib/forms/processingFormBranding";

describe("processingFormBranding", () => {
    it("parses branding from form definition row", () => {
        const branding = parseFormBranding({
            description: "Annual enrollment",
            metadata: { brand_name: "Bend Forest", accent_color: "#112233" },
        });
        expect(branding.brand_name).toBe("Bend Forest");
        expect(branding.accent_color).toBe("#112233");
        expect(branding.description).toBe("Annual enrollment");
    });

    it("builds metadata patch without dropping existing keys", () => {
        const patch = brandingMetadataPatch(
            { brand_name: "Alloy", accent_color: "#00A283", logo_url: null, description: "Test" },
            { field_count: 3, origin: "blank" }
        );
        expect(patch.brand_name).toBe("Alloy");
        expect(patch.field_count).toBe(3);
        expect(patch.origin).toBe("blank");
    });
});
