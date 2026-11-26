import { describe, expect, it } from "vitest";

import {
    computeThreadHasUnread,
    filterThreadsForFolder,
    parseInboxFolder,
    parseInboxLimit,
    previewFromMessageRow,
    threadSortTimestamp,
} from "@/lib/communications/inboxThreadsService";
import { resolveInboxEntityDrawerTarget } from "@/lib/communications/inboxEntityDrawerTarget";
import {
    buildInboxContextLine,
    resolveInboxPrimaryName,
    resolveInboxReplyTarget,
    inboxIdentityWithChannelFallback,
} from "@/lib/communications/inboxThreadIdentity";
import { inboxLabelIsGenericBoilerplate, sanitizeInboxEntityLabel } from "@/lib/communications/inboxThreadDisplayLabels";
import {
    mergeFolderCacheEntry,
    resolveSelectedThreadIdAfterFolderLoad,
    shouldShowFolderInitialLoading,
} from "@/lib/communications/inboxFolderCache";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

function thread(partial: Partial<InboxThreadListItem> & Pick<InboxThreadListItem, "id">): InboxThreadListItem {
    return {
        id: partial.id,
        org_id: partial.org_id ?? "org",
        channel: partial.channel ?? "email",
        recipient_key: partial.recipient_key ?? null,
        primary_entity_type: partial.primary_entity_type ?? "persons",
        primary_entity_id: partial.primary_entity_id ?? "p1",
        created_at: partial.created_at ?? null,
        updated_at: partial.updated_at ?? null,
        last_message_at: partial.last_message_at ?? null,
        archived_at: partial.archived_at ?? null,
        is_archived: partial.is_archived ?? false,
        sort_at: partial.sort_at ?? null,
        contact_display: partial.contact_display ?? null,
        family_display: partial.family_display ?? null,
        location_display: partial.location_display ?? null,
        status_display: partial.status_display ?? null,
        related_children_display: partial.related_children_display ?? null,
        related_contacts_display: partial.related_contacts_display ?? null,
        context_display: partial.context_display ?? null,
        channel_contact_display: partial.channel_contact_display ?? null,
        preview_lead: partial.preview_lead ?? null,
        reply_person_id: partial.reply_person_id ?? null,
        reply_email_available: partial.reply_email_available ?? true,
        reply_sms_available: partial.reply_sms_available ?? false,
        can_reply: partial.can_reply ?? false,
        sender_identity_state: partial.sender_identity_state ?? "identified",
        routing_state: partial.routing_state ?? "routed",
        routing_candidate_count: partial.routing_candidate_count ?? 0,
        routing_notice: partial.routing_notice ?? null,
        reply_authority: partial.reply_authority ?? "none",
        reply_display_label: partial.reply_display_label ?? null,
        entity_chip: partial.entity_chip ?? null,
        last_message_preview: partial.last_message_preview ?? null,
        has_unread: partial.has_unread ?? false,
    };
}

describe("parseInboxFolder", () => {
    it("accepts known folders", () => {
        expect(parseInboxFolder("inbox")).toBe("inbox");
        expect(parseInboxFolder("UNREAD")).toBe("unread");
        expect(parseInboxFolder("scheduled")).toBe("scheduled");
    });

    it("rejects unknown folders", () => {
        expect(parseInboxFolder("drafts")).toBeNull();
        expect(parseInboxFolder("")).toBeNull();
    });
});

describe("parseInboxLimit", () => {
    it("defaults and caps limit", () => {
        expect(parseInboxLimit(null)).toBe(50);
        expect(parseInboxLimit(null, 20)).toBe(20);
        expect(parseInboxLimit("10")).toBe(10);
        expect(parseInboxLimit(999)).toBe(100);
        expect(parseInboxLimit(0)).toBe(50);
    });
});

describe("filterThreadsForFolder", () => {
    const rows = [
        thread({
            id: "a",
            has_unread: true,
            last_message_preview: { direction: "inbound", channel: "email", status: null, body: "hi", created_at: null },
        }),
        thread({
            id: "b",
            has_unread: false,
            last_message_preview: { direction: "outbound", channel: "sms", status: "sent", body: "ok", created_at: null },
        }),
        thread({
            id: "c",
            has_unread: false,
            last_message_preview: { direction: "inbound", channel: "email", status: null, body: "read", created_at: null },
        }),
    ];

    it("passes through inbox and archived unchanged", () => {
        expect(filterThreadsForFolder("inbox", rows)).toHaveLength(3);
        expect(filterThreadsForFolder("archived", rows)).toHaveLength(3);
    });

    it("filters unread folder", () => {
        expect(filterThreadsForFolder("unread", rows).map((t) => t.id)).toEqual(["a"]);
    });

    it("filters sent folder by last outbound preview", () => {
        expect(filterThreadsForFolder("sent", rows).map((t) => t.id)).toEqual(["b"]);
    });
});

describe("computeThreadHasUnread", () => {
    it("returns true when any inbound id is unread", () => {
        const read = new Set(["m1"]);
        expect(computeThreadHasUnread(["m1", "m2"], read)).toBe(true);
        expect(computeThreadHasUnread(["m1"], read)).toBe(false);
        expect(computeThreadHasUnread([], read)).toBe(false);
    });
});

describe("threadSortTimestamp", () => {
    it("prefers last_message_at then updated_at", () => {
        expect(
            threadSortTimestamp({
                last_message_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-05-01T12:00:00.000Z",
                created_at: "2026-04-01T12:00:00.000Z",
            })
        ).toBe("2026-06-01T12:00:00.000Z");
        expect(
            threadSortTimestamp({
                last_message_at: null,
                updated_at: "2026-05-01T12:00:00.000Z",
                created_at: "2026-04-01T12:00:00.000Z",
            })
        ).toBe("2026-05-01T12:00:00.000Z");
    });
});

describe("previewFromMessageRow", () => {
    it("maps message fields", () => {
        expect(
            previewFromMessageRow({
                direction: "inbound",
                channel: "sms",
                status: "delivered",
                body: "Hello",
                created_at: "2026-06-01T10:00:00.000Z",
            })
        ).toEqual({
            direction: "inbound",
            channel: "sms",
            status: "delivered",
            body: "Hello",
            created_at: "2026-06-01T10:00:00.000Z",
        });
    });
});

describe("resolveInboxEntityDrawerTarget", () => {
    const oppId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    it("maps supported entity types to drawer targets", () => {
        expect(resolveInboxEntityDrawerTarget("opportunities", oppId)).toEqual({
            drawerType: "opportunities",
            entityId: oppId,
        });
        expect(resolveInboxEntityDrawerTarget("persons", oppId)).toEqual({
            drawerType: "persons",
            entityId: oppId,
        });
    });

    it("returns null for invalid or unsupported entities", () => {
        expect(resolveInboxEntityDrawerTarget("opportunities", "not-a-uuid")).toBeNull();
        expect(resolveInboxEntityDrawerTarget("forms", oppId)).toBeNull();
        expect(resolveInboxEntityDrawerTarget(null, oppId)).toBeNull();
    });
});

describe("inbox thread identity", () => {
    const personId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const oppId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    it("prefers person name over household for opportunity threads", () => {
        const personId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        const oppId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        const personNames = new Map<string, string>([[personId, "Priya Rivera"]]);
        const primaryPersonByOpportunity = new Map<string, string>([[oppId, personId]]);
        const name = resolveInboxPrimaryName(
            inboxIdentityWithChannelFallback({
                primaryEntityType: "opportunities",
                primaryEntityId: oppId,
                channel: "email",
                recipientKey: "priya@example.com",
                entityLabel: "Family inquiry",
                familyDisplay: "Rivera Household",
                locationDisplay: "North Campus",
                statusDisplay: "Tour Scheduled",
                personNames,
                primaryPersonByOpportunity,
                primaryPersonByJob: new Map(),
                channelContact: "priya@example.com",
                messageContactPersonId: personId,
            })
        );
        expect(name).toBe("Priya Rivera");
        expect(name.toLowerCase()).not.toContain("household");
    });

    it("builds context line with location and status", () => {
        expect(
            buildInboxContextLine({
                locationDisplay: "North Campus",
                statusDisplay: "Tour Scheduled",
            })
        ).toBe("North Campus · Tour Scheduled");
    });

    it("strips Family inquiry boilerplate from entity labels", () => {
        expect(inboxLabelIsGenericBoilerplate("Family inquiry")).toBe(true);
        expect(sanitizeInboxEntityLabel("Family inquiry — Mitchell / South Campus")).toBe("South Campus");
        expect(sanitizeInboxEntityLabel("Family inquiry")).toBeNull();
    });

    it("resolves reply target for person thread", () => {
        const target = resolveInboxReplyTarget(
            thread({
                id: "t1",
                primary_entity_type: "persons",
                primary_entity_id: personId,
                channel: "email",
                recipient_key: "priya@example.com",
                reply_person_id: personId,
                channel_contact_display: "priya@example.com",
                reply_email_available: true,
                reply_sms_available: true,
            })
        );
        expect(target.canReply).toBe(true);
        expect(target.entityType).toBe("persons");
        expect(target.recipientPersonId).toBe(personId);
        expect(target.channel).toBe("email");
    });

    it("resolves sms reply separately when toggled", () => {
        const target = resolveInboxReplyTarget(
            thread({
                id: "t1",
                primary_entity_type: "persons",
                primary_entity_id: personId,
                channel: "email",
                recipient_key: "priya@example.com",
                reply_person_id: personId,
                channel_contact_display: "priya@example.com",
                reply_email_available: true,
                reply_sms_available: true,
            }),
            "sms"
        );
        expect(target.channel).toBe("sms");
    });
});

describe("inbox folder cache", () => {
    it("uses cached folder without initial loading state", () => {
        const cache = mergeFolderCacheEntry({}, "inbox", {
            threads: [thread({ id: "a" })],
            scheduledSends: [],
            fetchedAt: Date.now(),
            error: null,
        });
        expect(shouldShowFolderInitialLoading(cache, "inbox")).toBe(false);
    });

    it("preserves selected thread on folder switch when still present", () => {
        const next = resolveSelectedThreadIdAfterFolderLoad({
            folder: "unread",
            threads: [thread({ id: "a" }), thread({ id: "b" })],
            previousSelectedId: "b",
            autoSelectFirst: false,
        });
        expect(next).toBe("b");
    });
});
