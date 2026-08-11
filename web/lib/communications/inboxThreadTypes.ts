import type {
    InboxRoutingState,
    InboxSenderIdentityState,
} from "@/lib/communications/inboxThreadRoutingState";

/** Which recipient authority a reply on this thread must carry. */
export type InboxReplyAuthority = "person" | "thread" | "none";

/** Inbox folder identifiers (Sprint A). */
export type InboxFolder = "inbox" | "unread" | "sent" | "scheduled" | "archived";

export const INBOX_FOLDERS: InboxFolder[] = ["inbox", "unread", "sent", "scheduled", "archived"];

export type InboxMessagePreview = {
    direction: string;
    channel: string;
    status: string | null;
    body: string | null;
    created_at: string | null;
};

export type InboxEntityChip = {
    entity_type: string;
    entity_id: string;
    label: string;
};

export type InboxThreadListItem = {
    id: string;
    org_id: string;
    channel: string;
    recipient_key: string | null;
    primary_entity_type: string;
    primary_entity_id: string;
    created_at: string | null;
    updated_at: string | null;
    last_message_at: string | null;
    archived_at: string | null;
    is_archived: boolean;
    sort_at: string | null;
    contact_display: string | null;
    family_display: string | null;
    location_display: string | null;
    status_display: string | null;
    related_children_display: string | null;
    related_contacts_display: string | null;
    context_display: string | null;
    channel_contact_display: string | null;
    preview_lead: string | null;
    reply_person_id: string | null;
    reply_email_available: boolean;
    reply_sms_available: boolean;
    can_reply: boolean;
    /** Whether the inbound seam attributed this conversation to a Person. */
    sender_identity_state: InboxSenderIdentityState;
    /** Whether Alloy could decide where a reply belongs. */
    routing_state: InboxRoutingState;
    /** In-org people matching the sender when routing stayed ambiguous. Count only. */
    routing_candidate_count: number;
    /** Operator-safe sentence for an unresolved routing decision. Never an enum or id. */
    routing_notice: string | null;
    /**
     * The only recipient authority the client may put on the wire. `thread` means
     * the server derives the destination from canonical inbound truth — an address
     * from the client is refused, not ignored.
     */
    reply_authority: InboxReplyAuthority;
    /** "Jordan Smith" or "ending in 1234" — never a raw provider identity. */
    reply_display_label: string | null;
    entity_chip: InboxEntityChip | null;
    last_message_preview: InboxMessagePreview | null;
    has_unread: boolean;
};

export type InboxScheduledSendListItem = {
    id: string;
    channel: string;
    status: string;
    scheduled_for: string;
    body_preview: string;
    subject_snapshot: string | null;
    recipient_person_id: string;
    contact_display: string | null;
    entity_chip: InboxEntityChip | null;
};

export type InboxThreadsListResponse = {
    folder: InboxFolder;
    threads: InboxThreadListItem[];
    scheduled_sends: InboxScheduledSendListItem[];
    limit: number;
};
