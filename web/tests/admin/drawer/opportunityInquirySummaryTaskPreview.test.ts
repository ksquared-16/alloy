import { describe, expect, it } from "vitest";
import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

describe("parseInquirySummaryTaskPreview", () => {
    it("parses loaded shell payload", () => {
        const out = parseInquirySummaryTaskPreview({
            _inquiry_summary_tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "t1",
                        title: "Call parent",
                        due_at: "2026-05-22T12:00:00.000Z",
                        status: "open",
                        source: "task_assist",
                    },
                ],
            },
        });
        expect(out?.open_count).toBe(1);
        expect(out?.open_tasks[0]?.title).toBe("Call parent");
    });

    it("returns null when shell payload missing", () => {
        expect(parseInquirySummaryTaskPreview({})).toBeNull();
    });
});
