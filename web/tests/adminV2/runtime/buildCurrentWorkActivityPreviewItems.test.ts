import { describe, expect, it } from "vitest";

import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import type { OperationalContext, OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";

const NULL_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
};

function context(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Digan Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth,
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

describe("buildCurrentWorkActivityPreviewItems", () => {
    it("consumes canonical record activity when signals are empty", () => {
        const items = buildCurrentWorkActivityPreviewItemsFromContext(
            context({
                recent_communication: [
                    {
                        label: "Left message for family",
                        body: "Left message for family",
                        created_at: "2026-07-10T10:15:00.000Z",
                    },
                ],
            }),
        );

        expect(items.length).toBeGreaterThan(0);
        expect(items[0]?.label).toContain("Left message");
        expect(items[0]?.category).toBe("Communication");
        expect(items[0]?.occurredAt).toBeTruthy();
    });

    it("falls back to recent record activity when no work-specific events match", () => {
        const items = buildCurrentWorkActivityPreviewItemsFromContext(
            context({
                notes: [{ body: "Program preference updated", created_at: "2026-07-09T15:40:00.000Z" }],
            }),
            { workTemplateKey: "contact_family" },
        );

        expect(items.length).toBeGreaterThan(0);
        expect(items[0]?.label).toContain("Program preference");
    });

    it("returns empty array for genuine empty state", () => {
        expect(buildCurrentWorkActivityPreviewItemsFromContext(context({}))).toEqual([]);
    });
});
