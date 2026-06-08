import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("BOS recommendation content regression", () => {
    it("OperationalAttentionHeaderStrip renders review assist when only recommendation payload exists", () => {
        const strip = read("components/admin/drawer/OperationalAttentionHeaderStrip.tsx");
        expect(strip).toContain("renderReviewAssistBand");
        expect(strip).toMatch(/if \(!payload\) \{[\s\S]*renderReviewAssistBand/);
    });

    it("Review assist band shows operational read and do next without line clamp in chrome mode", () => {
        const band = read("components/admin/drawer/OperationalReviewAssistBand.tsx");
        expect(band).toContain('data-review-assist-row="operational_read"');
        expect(band).toContain('data-review-assist-row="do_next"');
        expect(band).not.toContain("line-clamp-1");
    });

    it("Inquiry summary avoids duplicate BOS — CTA lives in drawer header only", () => {
        const rightCol = read("components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx");
        expect(rightCol).not.toContain("BosDrawerAssistCta");
        expect(rightCol).not.toContain("showStandaloneBos");
    });
});
