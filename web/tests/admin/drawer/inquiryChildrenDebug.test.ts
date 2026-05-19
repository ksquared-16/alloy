import { describe, expect, it } from "vitest";

import { filterInquiryChildRowsForDrawer } from "@/lib/admin/drawer/inquiryChildrenDebug";

describe("inquiryChildrenDebug", () => {
    it("filterInquiryChildRowsForDrawer drops metadata_child and rows without identity", () => {
        const { kept, dropped } = filterInquiryChildRowsForDrawer([
            { id: "ocm-1", customer_member_id: "cm-1", display_name: "Ava" },
            { id: "meta", customer_member_id: "metadata_child:x", display_name: "Ghost" },
            { id: "", customer_member_id: "cm-2", display_name: "Noah" },
            { id: "unlinked:cm-3", customer_member_id: "cm-3", display_name: "Sam" },
        ]);
        expect(kept).toHaveLength(2);
        expect(kept.map((r) => r.customer_member_id)).toEqual(["cm-1", "cm-3"]);
        expect(dropped).toHaveLength(2);
    });
});
