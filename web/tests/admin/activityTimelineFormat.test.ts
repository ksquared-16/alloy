import { describe, expect, it } from "vitest";
import {
    formatActivityQueueNotesBlobPreview,
    formatActivityQueueNotesBlobPreviewParts,
    formatActivityTimelineEvent,
    formatQueueNoteDateTime,
    getActivityTimelineActorLabel,
    humanizeSnakeCaseToken,
} from "@/lib/admin/activityTimelineFormat";

describe("activityTimelineFormat (generic)", () => {
    it("humanizes snake_case without status map (title case words)", () => {
        expect(humanizeSnakeCaseToken("lost")).toBe("Lost");
        expect(humanizeSnakeCaseToken("new_inquiry")).toBe("New Inquiry");
    });

    it("humanizes with optional statusKeyLabels", () => {
        const labels = { new_inquiry: "Fresh Lead" };
        expect(humanizeSnakeCaseToken("new_inquiry", labels)).toBe("Fresh Lead");
    });

    it("formatActivityTimelineEvent uses eventTypeLabels and empty options does not infer status transition detail", () => {
        const r = formatActivityTimelineEvent(
            {
                event_type: "opportunity_status_changed",
                payload: { old_status_key: "a", new_status_key: "b" },
            },
            {
                eventTypeLabels: { opportunity_status_changed: "Changed" },
            }
        );
        expect(r.title).toBe("Changed");
        expect(r.detail).toBeNull();
    });

    it("formatActivityTimelineEvent shows transition when statusTransitionEventTypes set", () => {
        const r = formatActivityTimelineEvent(
            {
                event_type: "entity_status_changed",
                payload: { old_status_key: "open", new_status_key: "done" },
            },
            {
                eventTypeLabels: { entity_status_changed: "Status changed" },
                statusTransitionEventTypes: ["entity_status_changed"],
            }
        );
        expect(r.title).toBe("Status changed");
        expect(r.detail).toBe("Open → Done");
    });

    it("actor fallbacks: Staff when actor_user_id only", () => {
        expect(getActivityTimelineActorLabel({ actor_user_id: "x" }, null, {})).toBe("Staff");
    });

    it("actor: Automation from source", () => {
        expect(getActivityTimelineActorLabel({ source: "workflow" }, null, {})).toBe("Automation");
    });

    it("queue blob preview matches local-formatted date", () => {
        const raw = "[2026-04-29T21:15:05Z] Hello";
        const out = formatActivityQueueNotesBlobPreview(raw);
        const want = `Hello · ${formatQueueNoteDateTime(Date.parse("2026-04-29T21:15:05Z"))}`;
        expect(out).toBe(want);
    });

    it("queue blob preview parts split timestamp and body (note · datetime order)", () => {
        const raw = "[2026-04-29T21:15:05Z] Hello";
        const parts = formatActivityQueueNotesBlobPreviewParts(raw);
        const wantTs = formatQueueNoteDateTime(Date.parse("2026-04-29T21:15:05Z"));
        expect(parts).toEqual({ timestamp: wantTs, body: "Hello" });
        expect(wantTs).not.toContain(",");
    });

    // A refusal without its reason answers a question the operator did not have:
    // they can already see that nothing arrived.
    it("shows the operator-safe reason as the detail for a blocked send", () => {
        const out = formatActivityTimelineEvent({
            event_type: "message_blocked",
            payload: {
                channel: "sms",
                reason: "SUPPRESSED",
                operator_message: "This address is suppressed after a hard bounce.",
            },
        });
        expect(out.title).toBe("SMS blocked");
        expect(out.detail).toBe("This address is suppressed after a hard bounce.");
    });

    it("falls back to the block code when no operator message was recorded", () => {
        const out = formatActivityTimelineEvent({
            event_type: "message_deferred",
            payload: { channel: "email", reason: "QUIET_HOURS" },
        });
        expect(out.title).toBe("Email deferred");
        expect(out.detail).toBe("Quiet Hours");
    });
});
