import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("drawer loading guardrail audit", () => {
    it("Person drawer still uses prefetch snapshot without duplicate open coordinator", () => {
        const prefetch = read("lib/admin/prefetchPersonDrawerSnapshot.ts");
        expect(prefetch).toContain("/api/admin/entity/persons/");
        expect(prefetch).not.toContain("openCoordinator");

        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("prefetchPersonDrawerSnapshot");
        expect(drawer).toContain('opportunityEntitySurface ?? "drawer_visible"');
    });

    it("Inquiry children shell attach remains on staged drawer beats only", () => {
        const entity = read("lib/admin/opportunityEntityRecord.ts");
        expect(entity).toContain("attachOpportunityInquiryChildrenShell");
        expect(entity).toMatch(/drawer_visible[\s\S]*attachOpportunityInquiryChildrenShell/);
        expect(entity).toMatch(/drawer_primary[\s\S]*attachOpportunityInquiryChildrenShell/);

        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("shellShowsInquiryChildren");
        expect(drawer).not.toMatch(/hasFullInquiryChildren/);
    });

    it("Lead summary density uses compact family contacts shell without new fetch loops", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("oppInqInnerCardCompact");

        const family = read("components/admin/opportunity/FamilyContactsPanel.tsx");
        expect(family).toContain("INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS");

        const geometry = read("lib/admin/drawer/opportunityInquiryRightColumnGeometry.ts");
        expect(geometry).toContain("space-y-0");
        expect(geometry).toContain("min-h-[2rem]");
        expect(geometry).not.toContain("min-h-[4rem]");
    });
});
