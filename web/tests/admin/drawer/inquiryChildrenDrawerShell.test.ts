import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    inquiryChildrenRowCountFromEntity,
    mapRawInquiryChildrenToDrawerRows,
} from "@/lib/admin/drawer/inquiryChildrenDrawerRows";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("inquiry children drawer shell runtime", () => {
    it("maps bootstrap children rows without waiting for surface=full", () => {
        const raw = [
            {
                id: "ocm-1",
                customer_member_id: "cm-1",
                display_name: "Patel Child One",
                linked_on_inquiry: true,
                ocm_id: "ocm-1",
            },
            {
                id: "ocm-2",
                customer_member_id: "cm-2",
                display_name: "Patel Child Two",
                linked_on_inquiry: true,
                ocm_id: "ocm-2",
            },
        ];
        const rows = mapRawInquiryChildrenToDrawerRows(raw);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.display_name).toBe("Patel Child One");
    });

    it("OpportunityInquiryChildrenSection uses row shells not header-only loading card", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("data-inquiry-children-shell-placeholder");
        expect(src).toContain("data-inquiry-children-placeholder-row");
        expect(src).toContain("shellReservedRowCount");
        expect(src).not.toContain("Loading inquiry children");
        expect(src).toContain("InquiryChildDrawerIconButton");
        expect(src).not.toMatch(/INQUIRY_CHILD_COL_HDR}>Notes</);
        expect(src).not.toContain("min-w-[1100px]");
    });

    it("drawer owner attaches inquiry children on drawer_visible and drawer_primary", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        expect(src).toContain("attachOpportunityInquiryChildrenShell");
        expect(src).toMatch(/drawer_visible[\s\S]*attachOpportunityInquiryChildrenShell/);
        expect(src).toMatch(/drawer_primary[\s\S]*attachOpportunityInquiryChildrenShell/);
    });

});
