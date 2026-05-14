import { describe, expect, it } from "vitest";

import { buildQueueRowPriorityExplanationLine } from "@/lib/opportunities/queueRowPriorityExplanation";

describe("buildQueueRowPriorityExplanationLine", () => {
    it("returns null when not needs_attention", () => {
        expect(buildQueueRowPriorityExplanationLine({ _needs_attention: false, _attention_reason_label: "X" })).toBeNull();
    });

    it("returns null when label missing and no code", () => {
        expect(buildQueueRowPriorityExplanationLine({ _needs_attention: true })).toBeNull();
    });

    it("prefers short copy from attention reason code", () => {
        expect(
            buildQueueRowPriorityExplanationLine({
                _needs_attention: true,
                _attention_reason: "follow_up_date_passed",
                _attention_reason_label: "Follow-up overdue",
            }),
        ).toBe("Overdue follow-up");
    });

    it("maps waiting_on_documents", () => {
        expect(
            buildQueueRowPriorityExplanationLine({
                _needs_attention: true,
                _attention_reason: "waiting_on_documents",
                _attention_reason_label: "Waiting on documents",
            }),
        ).toBe("Waiting on documents");
    });

    it("maps tour_date_passed", () => {
        expect(
            buildQueueRowPriorityExplanationLine({
                _needs_attention: true,
                _attention_reason: "tour_date_passed",
                _attention_reason_label: "Tour date passed",
            }),
        ).toBe("Tour date passed");
    });

    it("falls back to trimmed label when code unknown", () => {
        expect(
            buildQueueRowPriorityExplanationLine({
                _needs_attention: true,
                _attention_reason: null,
                _attention_reason_label: "Custom label",
            }),
        ).toBe("Custom label");
    });
});
