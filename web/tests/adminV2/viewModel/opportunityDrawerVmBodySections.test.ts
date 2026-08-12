import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM drawer body — production parity sections", () => {

    it("does not render Family inquiry placeholder title pattern from raw record name", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                name: "Family inquiry — Smith",
                _customer_name: "Smith Household",
                _identity: {
                    household: { label: "Smith Household" },
                    primary_person: { label: "Smith Family" },
                },
            },
            "Lead"
        );
        expect(title).toBe("Smith Family");
        expect(title).not.toMatch(/Family inquiry/i);
    });

    it("OpportunityDrawerVmTabPanes covers full workflow tab strip", () => {
        const panes = read("components/admin/vmDrawer/OpportunityDrawerVmTabPanes.tsx");
        expect(panes).toContain('drawerTab === "notes"');
        expect(panes).toContain('drawerTab === "documents"');
        expect(panes).toContain('drawerTab === "activity"');
        expect(panes).toContain('drawerTab === "communications"');
    });

});
