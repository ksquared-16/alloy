import { describe, expect, it } from "vitest";

import {
    scheduledSendAttentionHeadline,
    scheduledSendCanEditContent,
    scheduledSendCanProcessNow,
    scheduledSendProcessErrorMessage,
} from "@/lib/agent/taskAssist/taskAssistScheduledSendPresentation";
import { scheduledSendDeliveryUrgency, scheduledSendUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

const NOW = new Date("2026-05-16T12:00:00.000Z");

describe("taskAssistScheduledSendPresentation", () => {
    it("extracts last_process_error message from metadata", () => {
        expect(
            scheduledSendProcessErrorMessage({
                last_process_error: { error: "send_failed", message: "Provider rejected message" },
            })
        ).toBe("Provider rejected message");
    });

    it("needs_attention headline explains unprocessed send", () => {
        const headline = scheduledSendAttentionHeadline("needs_attention");
        expect(headline).toContain("not been processed");
    });

    it("failed headline includes error detail", () => {
        const headline = scheduledSendAttentionHeadline("failed", {
            last_process_error: { message: "Twilio error" },
        });
        expect(headline).toContain("Twilio error");
    });

    it("past pending send is not overdue task label", () => {
        const badge = scheduledSendUrgencyBadge(
            { status: "pending", scheduled_for: "2026-05-16T08:00:00.000Z" },
            NOW
        );
        expect(badge.label).not.toBe("Overdue");
        expect(badge.urgency).toBe("needs_attention");
    });

    it("allows edit only for pending", () => {
        expect(scheduledSendCanEditContent("pending")).toBe(true);
        expect(scheduledSendCanEditContent("queued")).toBe(false);
        expect(scheduledSendCanEditContent("failed")).toBe(false);
    });

    it("allows process now when due", () => {
        expect(
            scheduledSendCanProcessNow("pending", "2026-05-16T10:00:00.000Z", NOW)
        ).toBe(true);
        expect(
            scheduledSendCanProcessNow("pending", "2026-05-16T14:00:00.000Z", NOW)
        ).toBe(false);
    });

    it("delivery urgency for failed status", () => {
        expect(
            scheduledSendDeliveryUrgency({ status: "failed", scheduledForIso: "2020-01-01T00:00:00.000Z", now: NOW })
        ).toBe("failed");
    });
});
