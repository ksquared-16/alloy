import { describe, expect, it } from "vitest";
import { buildQueueOperationalAttentionPresentation } from "@/lib/opportunities/operationalAttentionExplain";

describe("buildQueueOperationalAttentionPresentation", () => {
    it("compresses multi-reason and adds wait token", () => {
        const row = {
            _attention_reason: "waiting_on_staff",
            _attention_reason_label: "Waiting on staff",
            _attention_severity: "high",
            _attention_waiting_bucket: "waiting_on_staff",
            _attention_reasons_detail: [
                { code: "waiting_on_staff", sla_tier: "approaching" },
                { code: "mid_funnel_stale", sla_tier: "breached" },
            ],
        };
        const r = buildQueueOperationalAttentionPresentation(row);
        expect(r.summaryLine).toContain("Needs review:");
        expect(r.summaryLine).toContain("Staff wait");
        expect(r.summaryLine).toContain("+1 factors");
        expect(r.nextHintLine).toBeTruthy();
    });

    it("queueScan uses a stable Needs attention headline without wait tokens", () => {
        const row = {
            _attention_reason: "waiting_on_staff",
            _attention_reason_label: "Waiting on staff",
            _attention_severity: "high",
            _attention_waiting_bucket: "waiting_on_staff",
            _attention_reasons_detail: [
                { code: "waiting_on_staff", sla_tier: "approaching" },
                { code: "mid_funnel_stale", sla_tier: "breached" },
            ],
        };
        const r = buildQueueOperationalAttentionPresentation(row, { queueScan: true });
        expect(r.summaryLine).toMatch(/^Needs attention: Waiting on staff/);
        expect(r.summaryLine).toContain("+1 factor");
        expect(r.summaryLine).not.toContain("Staff wait");
        expect(r.nextHintLine).toBeTruthy();
    });

    it("falls back when only label present", () => {
        const row = { _attention_reason_label: "Tour follow-up overdue" };
        const r = buildQueueOperationalAttentionPresentation(row);
        expect(r.summaryLine).toContain("Tour follow-up overdue");
    });
});
