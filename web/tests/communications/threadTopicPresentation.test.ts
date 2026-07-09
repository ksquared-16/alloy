import { describe, expect, it } from "vitest";
import {
    deriveThreadChannelLabel,
    deriveThreadLastPreview,
    deriveThreadMessageSubject,
    deriveThreadTopicFallback,
    deriveThreadTopicTitle,
    formatThreadParticipantNames,
    threadsForActivityTopicRail,
} from "@/lib/communications/v2/familyWorkspace/threadTopicPresentation";
import type { ThreadVM } from "@/lib/communications/v2/familyWorkspace/types";

const baseThread = (over: Partial<ThreadVM>): ThreadVM => ({
    id: "t-1",
    subject: null,
    channel: "email",
    primaryEntity: { type: "customers", id: "c-1" },
    childId: null,
    opportunityId: null,
    lastActivityAt: "2026-07-08T12:00:00Z",
    messageCount: 2,
    unread: 0,
    slaState: null,
    attentionState: null,
    ...over,
});

describe("threadTopicPresentation", () => {
    it("derives title from thread subject when meaningful", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: "Tour confirmation" }),
            }),
        ).toBe("Tour confirmation");
    });

    it("falls back to SMS Conversation instead of raw SMS", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: "SMS", channel: "sms" }),
            }),
        ).toBe("SMS Conversation");
    });

    it("uses message subject when thread subject missing", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: null }),
                messageSubject: "Enrollment paperwork",
            }),
        ).toBe("Enrollment paperwork");
    });

    it("uses workflow label before channel fallback", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: null, channel: "sms" }),
                workflowLabel: "Waitlist follow-up",
            }),
        ).toBe("Waitlist follow-up");
    });

    it("deriveThreadTopicFallback returns General Questions for unknown channel", () => {
        expect(deriveThreadTopicFallback(null)).toBe("General Questions");
        expect(deriveThreadTopicFallback("email")).toBe("Email Conversation");
    });

    it("filters zero-message threads from activity rail", () => {
        const rows = threadsForActivityTopicRail([
            baseThread({ id: "a", messageCount: 2 }),
            baseThread({ id: "b", messageCount: 0 }),
        ]);
        expect(rows.map((t) => t.id)).toEqual(["a"]);
    });

    it("derives latest message preview for a thread", () => {
        const preview = deriveThreadLastPreview("t-1", [
            { thread_id: "t-1", body: "Older note", created_at: "2026-07-07T10:00:00Z", kind: "message" },
            { thread_id: "t-1", body: "Latest reply here", created_at: "2026-07-08T12:00:00Z", kind: "message" },
            { thread_id: "t-2", body: "Other thread", created_at: "2026-07-09T12:00:00Z", kind: "message" },
        ]);
        expect(preview).toBe("Latest reply here");
    });

    it("formats participant names with overflow", () => {
        expect(
            formatThreadParticipantNames([
                { id: "1", displayName: "Sarah Rivera" } as never,
                { id: "2", displayName: "James Rivera" } as never,
                { id: "3", displayName: "Guest" } as never,
            ]),
        ).toBe("Sarah Rivera, James Rivera +1");
    });

    it("derives message subject from timeline for thread title fallback", () => {
        const subject = deriveThreadMessageSubject("t-1", [
            { thread_id: "t-1", subject: "  Paperwork due  ", body: "Hi" },
            { thread_id: "t-2", subject: "Other", body: "x" },
        ]);
        expect(subject).toBe("Paperwork due");
    });

    it("maps channel pill label", () => {
        expect(deriveThreadChannelLabel("sms")).toBe("SMS");
        expect(deriveThreadChannelLabel("email")).toBe("Email");
    });
});
