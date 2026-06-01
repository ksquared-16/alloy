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
