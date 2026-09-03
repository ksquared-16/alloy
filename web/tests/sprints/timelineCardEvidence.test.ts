/**
 * Timeline card evidence — sprint tests.
 *
 * Verifies that buildTimelineCardEvidence correctly derives events from
 * OperationalContext truth without fabricating data.
 */

import { describe, expect, it } from "vitest";
import { buildTimelineCardEvidence } from "@/lib/adminV2/runtime/focusPanel/timeline/buildTimelineCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

function makeContext(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "test-1", label: "Test Lead" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            work: {
                primary: null,
                items: [],
                openCount: 0,
                overdueCount: 0,
                nextActionLabel: null,
            },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: false, maskedChannels: false },
        status: "ready",
    };
}

describe("buildTimelineCardEvidence", () => {
    it("no truth record events (only created_at fallback) → single 'Created' event", () => {
        const context = makeContext({ created_at: "2026-06-01T10:00:00Z" });
        const evidence = buildTimelineCardEvidence(context);

        expect(evidence.hasEvents).toBe(true);
        expect(evidence.events.length).toBeGreaterThanOrEqual(1);
        const createdEvent = evidence.events.find((e) => e.label === "Created");
        expect(createdEvent).toBeDefined();
        expect(evidence.isEmpty).toBe(false);
        expect(evidence.answerLine).toMatch(/recent event/);
    });

    it("truth record with recent activity → events shown correctly", () => {
        const context = makeContext({
            created_at: "2026-05-01T10:00:00Z",
            follow_up_notes: "Called family, left voicemail",
            last_activity_summary: "Email opened",
            last_activity_at: "2026-06-15T14:00:00Z",
        });
        const evidence = buildTimelineCardEvidence(context);

        expect(evidence.hasEvents).toBe(true);
        expect(evidence.events.length).toBeGreaterThanOrEqual(2);
        const noteEvent = evidence.events.find((e) => e.label === "Note");
        expect(noteEvent).toBeDefined();
        expect(noteEvent?.detail).toContain("Called family");
        expect(evidence.isEmpty).toBe(false);
    });

    it("many events (>5) → truncated to 5", () => {
        const context = makeContext({
            created_at: "2026-04-01T10:00:00Z",
            updated_at: "2026-06-20T12:00:00Z",
            follow_up_notes: "Follow up note",
            last_activity_summary: "Portal login",
            last_activity_at: "2026-06-18T09:00:00Z",
            recent_communication: [
                { body: "Welcome email sent", channel: "Email", sent_at: "2026-06-10T08:00:00Z" },
            ],
            _status_display: "Tour Scheduled",
        });
        const evidence = buildTimelineCardEvidence(context);

        // resolveLeadActivityPreview already caps at 5; our builder also caps at 5.
        expect(evidence.events.length).toBeLessThanOrEqual(5);
        expect(evidence.hasEvents).toBe(true);
    });

    it("empty truth → isEmpty true, answerLine = 'No recent activity'", () => {
        const context = makeContext({});
        const evidence = buildTimelineCardEvidence(context);

        expect(evidence.isEmpty).toBe(true);
        expect(evidence.answerLine).toBe("No recent activity");
        expect(evidence.events).toHaveLength(0);
        expect(evidence.statusChip).toBeNull();
        expect(evidence.statusTone).toBe("neutral");
    });
});
