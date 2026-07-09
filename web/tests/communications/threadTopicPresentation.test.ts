import { describe, expect, it } from "vitest";
import {
    deriveMessageSenderLabel,
    deriveThreadChannelLabel,
    deriveThreadLastPreview,
    deriveThreadMessageSubject,
    deriveThreadParticipantPersonIds,
    deriveThreadReplyRecipientIds,
    deriveThreadTopicFallback,
    deriveThreadTopicTitle,
    formatThreadParticipantNames,
    resolveThreadRecipients,
    threadChannelToWorkspaceMode,
    threadsForActivityTopicRail,
} from "@/lib/communications/v2/familyWorkspace/threadTopicPresentation";
import type { RecipientVM, ThreadVM } from "@/lib/communications/v2/familyWorkspace/types";

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

const kelly: RecipientVM = {
    id: "person-kelly",
    displayName: "Kelly Smith",
    roleType: "parent",
    roleLabel: "Parent",
    isPrimary: true,
    tier: "primary",
    email: "kelly@example.com",
    phone: "+15551234567",
    channels: { email: { hasAddress: true, providerBound: true, available: true, unavailableReason: null, marketing: "unset", transactional: "unset", canSendTransactional: true, canSendMarketing: true }, sms: { hasAddress: true, providerBound: true, available: true, unavailableReason: null, marketing: "unset", transactional: "unset", canSendTransactional: true, canSendMarketing: true } },
};

const kristi: RecipientVM = {
    ...kelly,
    id: "person-kristi",
    displayName: "Kristi Smith",
    isPrimary: true,
};

describe("threadTopicPresentation", () => {
    it("derives title from thread subject when meaningful", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: "Tour confirmation" }),
            }),
        ).toBe("Tour confirmation");
    });

    it("falls back to General instead of SMS Conversation title text", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: "SMS", channel: "sms" }),
            }),
        ).toBe("General");
        expect(deriveThreadTopicFallback("sms")).toBe("General");
    });

    it("uses message subject when thread subject missing", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: null }),
                messageSubject: "Enrollment paperwork",
            }),
        ).toBe("Enrollment paperwork");
    });

    it("uses workflow label before General fallback", () => {
        expect(
            deriveThreadTopicTitle({
                thread: baseThread({ subject: null, channel: "sms" }),
                workflowLabel: "Waitlist follow-up",
            }),
        ).toBe("Waitlist follow-up");
    });

    it("filters zero-message threads from activity rail", () => {
        const rows = threadsForActivityTopicRail([
            baseThread({ id: "a", messageCount: 2 }),
            baseThread({ id: "b", messageCount: 0 }),
        ]);
        expect(rows.map((t) => t.id)).toEqual(["a"]);
    });

    it("SMS-to-Kelly-only thread does not include Kristi as participant", () => {
        const smsThread = baseThread({
            id: "sms-kelly",
            channel: "sms",
            primaryEntity: { type: "persons", id: "person-kelly" },
        });
        const messages = [
            {
                thread_id: "sms-kelly",
                direction: "outbound",
                recipient_person_id: "person-kelly",
                body: "Hi Kelly",
                created_at: "2026-07-08T12:00:00Z",
                kind: "message",
            },
        ];
        const participants = resolveThreadRecipients(smsThread, messages, [kelly, kristi]);
        expect(participants.map((p) => p.id)).toEqual(["person-kelly"]);
        expect(formatThreadParticipantNames(participants)).toBe("Kelly Smith");
    });

    it("deriveThreadReplyRecipientIds returns thread transport recipient only", () => {
        const thread = baseThread({
            id: "sms-kelly",
            channel: "sms",
            primaryEntity: { type: "persons", id: "person-kelly" },
        });
        const ids = deriveThreadReplyRecipientIds(thread, [
            { thread_id: "sms-kelly", recipient_person_id: "person-kelly", direction: "outbound" },
        ]);
        expect(ids).toEqual(["person-kelly"]);
    });

    it("threadChannelToWorkspaceMode defaults reply channel from thread", () => {
        expect(threadChannelToWorkspaceMode("sms")).toBe("sms");
        expect(threadChannelToWorkspaceMode("email")).toBe("email");
        expect(threadChannelToWorkspaceMode(null)).toBe("email");
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

    it("deriveMessageSenderLabel distinguishes sender from thread assignment", () => {
        expect(
            deriveMessageSenderLabel(
                { direction: "outbound", senderUserId: "user-1", senderDisplayName: null },
                { currentUserId: "user-1" },
            ),
        ).toBe("Sent by you");
        expect(
            deriveMessageSenderLabel(
                { direction: "outbound", senderUserId: null, senderDisplayName: null },
                { currentUserId: "user-1" },
            ),
        ).toBe("Sent from Alloy");
        expect(
            deriveMessageSenderLabel(
                { direction: "inbound", recipientPersonId: "person-kelly" },
                { recipientDisplayName: "Kelly Smith" },
            ),
        ).toBe("Kelly Smith");
    });

    it("deriveThreadParticipantPersonIds reads metadata recipient_person_id", () => {
        const thread = baseThread({ id: "t-x", primaryEntity: { type: "customers", id: "c-1" } });
        const ids = deriveThreadParticipantPersonIds(thread, [
            { thread_id: "t-x", metadata: { recipient_person_id: "person-kelly" }, direction: "outbound" },
        ]);
        expect(ids).toEqual(["person-kelly"]);
    });
});
