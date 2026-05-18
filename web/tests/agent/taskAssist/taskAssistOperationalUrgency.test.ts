import { describe, expect, it } from "vitest";

import {
    operationalTaskDueUrgency,
    operationalTaskUrgencyBadge,
    scheduledSendDeliveryUrgency,
    scheduledSendStripVisible,
    scheduledSendUrgencyBadge,
    SCHEDULED_SEND_PROCESSING_GRACE_MS,
} from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

const NOW = new Date("2026-05-16T12:00:00.000Z");

describe("operationalTaskDueUrgency", () => {
    it("marks open tasks with past due_at as overdue", () => {
        expect(
            operationalTaskDueUrgency({
                status: "open",
                dueAtIso: "2026-05-16T10:00:00.000Z",
                now: NOW,
            })
        ).toBe("overdue");
        expect(operationalTaskUrgencyBadge({ status: "open", due_at: "2026-05-16T10:00:00.000Z" }, NOW).label).toBe(
            "Overdue"
        );
    });

    it("marks open tasks due within 24h as due soon", () => {
        expect(
            operationalTaskDueUrgency({
                status: "open",
                dueAtIso: "2026-05-16T20:00:00.000Z",
                now: NOW,
            })
        ).toBe("due_soon");
    });

    it("maps completed and canceled statuses", () => {
        expect(operationalTaskDueUrgency({ status: "completed", dueAtIso: "2020-01-01T00:00:00.000Z", now: NOW })).toBe(
            "completed"
        );
        expect(operationalTaskDueUrgency({ status: "canceled", dueAtIso: "2020-01-01T00:00:00.000Z", now: NOW })).toBe(
            "canceled"
        );
    });
});

describe("scheduledSendDeliveryUrgency", () => {
    it("never returns overdue for past scheduled_for on pending sends", () => {
        const urgency = scheduledSendDeliveryUrgency({
            status: "pending",
            scheduledForIso: "2026-05-16T10:00:00.000Z",
            now: NOW,
            graceMs: SCHEDULED_SEND_PROCESSING_GRACE_MS,
        });
        expect(urgency).not.toBe("overdue");
        expect(["processing", "needs_attention"]).toContain(urgency);
        const badge = scheduledSendUrgencyBadge(
            { status: "pending", scheduled_for: "2026-05-16T10:00:00.000Z" },
            NOW
        );
        expect(badge.label).not.toBe("Overdue");
    });

    it("labels future pending sends as Scheduled", () => {
        expect(
            scheduledSendDeliveryUrgency({
                status: "pending",
                scheduledForIso: "2026-05-16T14:00:00.000Z",
                now: NOW,
            })
        ).toBe("scheduled");
        expect(
            scheduledSendUrgencyBadge({ status: "pending", scheduled_for: "2026-05-16T14:00:00.000Z" }, NOW).label
        ).toBe("Scheduled");
    });

    it("labels pending past grace as Scheduled but not processed", () => {
        expect(
            scheduledSendDeliveryUrgency({
                status: "pending",
                scheduledForIso: "2026-05-16T10:00:00.000Z",
                now: NOW,
                graceMs: 5 * 60 * 1000,
            })
        ).toBe("needs_attention");
        expect(
            scheduledSendUrgencyBadge(
                { status: "pending", scheduled_for: "2026-05-16T10:00:00.000Z" },
                NOW,
                5 * 60 * 1000
            ).label
        ).toBe("Scheduled but not processed");
    });

    it("labels pending within grace as Processing", () => {
        expect(
            scheduledSendDeliveryUrgency({
                status: "claimed",
                scheduledForIso: "2026-05-16T11:50:00.000Z",
                now: NOW,
                graceMs: SCHEDULED_SEND_PROCESSING_GRACE_MS,
            })
        ).toBe("processing");
    });

    it("maps pipeline terminal states", () => {
        expect(scheduledSendDeliveryUrgency({ status: "failed", scheduledForIso: "", now: NOW })).toBe("failed");
        expect(scheduledSendDeliveryUrgency({ status: "queued", scheduledForIso: "", now: NOW })).toBe("queued");
        expect(scheduledSendDeliveryUrgency({ status: "delivered", scheduledForIso: "", now: NOW })).toBe("delivered");
    });

    it("hides delivered and canceled from strip", () => {
        expect(scheduledSendStripVisible("delivered")).toBe(false);
        expect(scheduledSendStripVisible("canceled")).toBe(false);
        expect(scheduledSendStripVisible("pending")).toBe(true);
        expect(scheduledSendStripVisible("failed")).toBe(true);
    });
});
