import { describe, expect, it } from "vitest";

import { resolveCompressedQueueHeader } from "@/lib/adminV2/runtime/compressedQueueHeader";

describe("resolveCompressedQueueHeader", () => {
    it("shows branded summary with eyebrow + total record count (never a selection count)", () => {
        const h = resolveCompressedQueueHeader(
            { title: "Lead", laneQueueLabel: "Lead lane", countBadge: 7, countBadgeUnit: "families" },
            0,
        );
        expect(h.perspectiveName).toBe("Lead");
        expect(h.countLabel).toBe("7 families");
        expect(h.summaryLine).toBe("Active lens · 7 families");
        expect(h.eyebrow).toBe("Active lens");
    });

    it("includes attention in the branded summary line", () => {
        const h = resolveCompressedQueueHeader(
            { title: "Today's Tours", countBadge: 7, countBadgeUnit: "families" },
            2,
        );
        expect(h.summaryLine).toBe("Active lens · 7 families · 2 need attention");
    });

    it("does not surface a lone '1 family' as a confusing selected count — it is total visible", () => {
        const h = resolveCompressedQueueHeader({ title: "Waitlist", countBadge: 1, countBadgeUnit: "family" }, 0);
        expect(h.countLabel).toBe("1 family");
        expect(h.summaryLine).toBe("Active lens · 1 family");
        // The phrase is total visible records, not selection — eyebrow makes that clear.
        expect(h.summaryLine).toContain("Active lens");
    });

    it("singularizes attention copy for one record", () => {
        const h = resolveCompressedQueueHeader({ title: "Waitlist", countBadge: 3 }, 1);
        expect(h.attentionLabel).toBe("1 needs attention");
    });

    it("falls back to laneQueueLabel when title is empty", () => {
        const h = resolveCompressedQueueHeader({ title: "", laneQueueLabel: "Waitlist" }, 0);
        expect(h.perspectiveName).toBe("Waitlist");
    });
});
