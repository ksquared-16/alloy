import { describe, expect, it } from "vitest";
import { summarizeAttentionReasonCounts } from "@/lib/workspace/attentionReasonCountsSummary";

describe("summarizeAttentionReasonCounts", () => {
    it("aggregates by reason_key using provided labels and sorts by count", () => {
        const rows = summarizeAttentionReasonCounts([
            { reason_key: "stale_new_inquiry", label: "New inquiry is stale" },
            { reason_key: "follow_up_date_passed", label: "Follow-up date passed" },
            { reason_key: "stale_new_inquiry", label: "New inquiry is stale" },
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.reason_key).toBe("stale_new_inquiry");
        expect(rows[0]?.count).toBe(2);
        expect(rows[1]?.reason_key).toBe("follow_up_date_passed");
        expect(rows[1]?.count).toBe(1);
    });

    it("falls back labels for known codes via defaults", () => {
        const rows = summarizeAttentionReasonCounts([{ reason_key: "missing_identity", label: "" }]);
        expect(rows[0]?.label).toBe("Missing contact/customer");
    });
});
