import { describe, expect, it } from "vitest";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

describe("layout settings queue doc load", () => {
    it("parses the default lead queue doc including related_list columns with adornments", () => {
        const doc = buildLeadQueueDefaultDoc();
        const parsed = parseLayoutDoc(doc);
        expect(parsed.ok).toBe(true);
        expect(parsed.doc?.sections.length).toBeGreaterThan(0);

        const items = parsed.doc!.sections[0]!.rows[0]!.columns[0]!.items;
        const childrenList = items.find((item) => item.kind === "related_list");
        expect(childrenList?.columns?.length).toBeGreaterThan(0);
        expect(childrenList?.columns?.[0]?.adornment?.action?.entity).toBe("child");
    });
});
