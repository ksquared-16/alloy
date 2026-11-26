import { describe, expect, it } from "vitest";

import { filterInboxThreadsBySearch } from "@/lib/adminV2/messaging/inboxThreadSearch";
import {
    combineLocalDateAndTime,
    formatMessagingDateTimeLocal,
} from "@/lib/adminV2/messaging/messagingLocalDateTime";
import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

function thread(partial: Partial<InboxThreadListItem>): InboxThreadListItem {
    return {
        id: partial.id ?? "t1",
        org_id: "org",
        channel: partial.channel ?? "email",
        recipient_key: partial.recipient_key ?? "parent@example.com",
        primary_entity_type: partial.primary_entity_type ?? "opportunities",
        primary_entity_id: partial.primary_entity_id ?? "opp-1",
        created_at: null,
        updated_at: null,
        last_message_at: null,
        archived_at: null,
        is_archived: false,
        sort_at: null,
        contact_display: partial.contact_display ?? "Jane Doe",
        family_display: partial.family_display ?? null,
        location_display: partial.location_display ?? null,
        status_display: partial.status_display ?? null,
        related_children_display: partial.related_children_display ?? null,
        related_contacts_display: partial.related_contacts_display ?? null,
        context_display: partial.context_display ?? null,
        channel_contact_display: partial.channel_contact_display ?? null,
        preview_lead: partial.preview_lead ?? null,
        reply_person_id: null,
        reply_email_available: true,
        reply_sms_available: false,
        can_reply: true,
        sender_identity_state: partial.sender_identity_state ?? "identified",
        routing_state: partial.routing_state ?? "routed",
        routing_candidate_count: partial.routing_candidate_count ?? 0,
        routing_notice: partial.routing_notice ?? null,
        reply_authority: partial.reply_authority ?? "person",
        reply_display_label: partial.reply_display_label ?? null,
        entity_chip: null,
        last_message_preview: partial.last_message_preview ?? null,
        has_unread: false,
    };
}

describe("inboxThreadSearch", () => {
    it("filters by contact, email, phone, children, and preview", () => {
        const rows = [
            thread({ id: "1", contact_display: "Jane Doe", channel_contact_display: "jane@example.com" }),
            thread({
                id: "2",
                contact_display: "Sam Lee",
                related_children_display: "Maya",
                preview_lead: "Tour follow-up tomorrow",
            }),
            thread({ id: "3", contact_display: "Desk", recipient_key: "5551234567" }),
        ];
        expect(filterInboxThreadsBySearch(rows, "jane@example.com")).toHaveLength(1);
        expect(filterInboxThreadsBySearch(rows, "maya")[0]?.id).toBe("2");
        expect(filterInboxThreadsBySearch(rows, "5551234567")[0]?.id).toBe("3");
        expect(filterInboxThreadsBySearch(rows, "tour follow")[0]?.id).toBe("2");
    });
});

describe("messagingLocalDateTime", () => {
    it("combines local date and time for ISO scheduling payload", () => {
        const dt = combineLocalDateAndTime("2030-06-15", "14:30");
        expect(dt).not.toBeNull();
        expect(dt!.toISOString()).toMatch(/2030-06-15T/);
    });

    it("formats timestamps via local formatter helper", () => {
        const formatted = formatMessagingDateTimeLocal("2030-06-15T18:30:00.000Z");
        expect(formatted).not.toBe("-");
    });
});
