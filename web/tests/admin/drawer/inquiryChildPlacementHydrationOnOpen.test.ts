import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("inquiry child placement hydration on drawer open", () => {
    it("loads location and program option sets when placement labels enabled (not only isEditing)", () => {
        const section = readSrc("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(section).toContain("enrichmentFetchEnabled || placementLabelFetchEnabled");
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("enrichmentFetchEnabled={drawerChildRows.length > 0 && !!canMutate}");
        expect(drawer).toContain("placementLabelFetchEnabled={drawerChildRows.length > 0}");
    });

    it("opportunity entity hydrates inquiry children placement labels server-side", () => {
        const record = readSrc("lib/admin/opportunityEntityRecord.ts");
        expect(record).toContain("enrichInquiryChildrenWithPlacementOptionLabels");
        expect(record).not.toMatch(/demo_program_label:\s*demoProgramLabel/);
    });
});
