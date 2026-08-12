import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Lead Summary density + BOS regression", () => {
    it("geometry avoids large reserved min-heights in summary layout", () => {
        const geometry = read("lib/admin/drawer/opportunityInquiryRightColumnGeometry.ts");
        expect(geometry).not.toContain("min-h-[16rem]");
        expect(geometry).not.toContain("min-h-[8.5rem]");
        expect(geometry).not.toContain("h-[7.25rem]");
        expect(geometry).toContain("INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS");
        expect(geometry).not.toMatch(/INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS[\s\S]*flex-1/);
    });

    it("Family & contacts summary variant does not reserve large blank min-heights", () => {
        const family = read("components/admin/opportunity/FamilyContactsPanel.tsx");
        const geometry = read("lib/admin/drawer/opportunityInquiryRightColumnGeometry.ts");
        expect(family).not.toContain('variant === "summary" ? "min-h-[2rem]"');
        expect(family).toContain('variant === "summary" ? "mt-0"');
        expect(geometry).toContain("space-y-0.5");
        expect(family).toContain('variant !== "summary" ?');
    });

    it("Review Assist calm state keeps summary content without duplicate BOS CTA", () => {
        const rightCol = read("components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx");
        expect(rightCol).not.toContain("BosDrawerAssistCta");
        expect(rightCol).toContain('"calm"');
        expect(rightCol).not.toContain('data-review-assist-placeholder="reserved"');
        expect(rightCol).not.toContain("min-h-[3.25rem]");
    });

    it("Review Assist routes actionable payload through attention strip without BOS CTA", () => {
        const rightCol = read("components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx");
        expect(rightCol).not.toContain("bosAssistEntityId");
        expect(rightCol).toContain("_operational_recommendation");
        expect(rightCol).toContain("_operational_attention");
        expect(rightCol).toContain("OperationalAttentionHeaderStrip");
    });
});
