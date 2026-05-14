import { describe, expect, it } from "vitest";

import { buildQueueRowPriorityExplanationLine } from "@/lib/opportunities/queueRowPriorityExplanation";

describe("buildQueueRowPriorityExplanationLine", () => {
    it("returns null when not needs_attention", () => {
        expect(buildQueueRowPriorityExplanationLine({ _needs_attention: false, _attention_reason_label: "X" })).toBeNull();
    });

    it("returns null when label missing", () => {
        expect(buildQueueRowPriorityExplanationLine({ _needs_attention: true })).toBeNull();
    });

    it("uses primary label and appends breached hint", () => {
        const line = buildQueueRowPriorityExplanationLine({
            _needs_attention: true,
            _attention_reason_label: "Follow-up overdue",
            _attention_reasons_detail: [
                { code: "follow_up_date_passed", label: "Follow-up overdue", severity: "high", sla_tier: "breached" },
            ],
        });
        expect(line).toContain("Follow-up overdue");
        expect(line).toContain("Past due vs goal");
    });

    it("returns label only when tiers are ok", () => {
        expect(
            buildQueueRowPriorityExplanationLine({
                _needs_attention: true,
                _attention_reason_label: "Waiting on documents",
                _attention_reasons_detail: [
                    { code: "waiting_on_documents", label: "Waiting on documents", severity: "medium", sla_tier: "ok" },
                ],
            }),
        ).toBe("Waiting on documents");
    });
});
