import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterOpportunityOverviewSectionsForFirstPaint } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 drawer recovery — Track A contracts", () => {

    it("does not render empty additional-contacts copy", () => {
        const panel = read("components/admin/opportunity/FamilyContactsPanel.tsx");
        expect(panel).not.toContain("No additional contacts linked yet.");
    });

    it("drawer scroll clears command bar via workspace css", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain('[data-adminv2-record-modal="true"] [data-adminv2-record-modal-scroll]');
        expect(css).toContain("var(--ws-shell-bottom-safe, 120px)");
    });

    it("drawer_primary defers operational attention on server", () => {
        const entity = read("lib/admin/opportunityEntityRecord.ts");
        const primaryStart = entity.indexOf('surfaceParamEarly === "drawer_primary"');
        const primaryBlock = entity.slice(
            primaryStart,
            entity.indexOf("return NextResponse.json(out", primaryStart)
        );
        expect(primaryBlock).not.toContain("attachOpportunityAttentionSuggestionBundle");
        expect(primaryBlock).toContain("_operational_attention_deferred = true");
    });
});

describe("enrichment-held overview sections", () => {
    it("keeps inquiry_children expanded while enrichment is held", () => {
        const sections = [
            { key: "inquiry_children", title: "Children", defaultExpanded: false, collapsible: true, fields: [] },
            { key: "source", title: "Source", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const out = filterOpportunityOverviewSectionsForFirstPaint(sections, false, false, true);
        expect(out.find((s) => s.key === "inquiry_children")?.defaultExpanded).toBe(true);
        expect(out.find((s) => s.key === "source")?.defaultExpanded).toBe(false);
    });
});
