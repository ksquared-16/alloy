import type { InboxMessagePreview, InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";
import { sanitizeInboxEntityLabel } from "@/lib/communications/inboxThreadDisplayLabels";
import {
    UNKNOWN_SENDER_ENTITY_TYPE,
    maskInboxEndpointForDisplay,
} from "@/lib/communications/inboxThreadRoutingState";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const REPLY_ENTITY_TYPES = new Set(["opportunities", "jobs", "persons"]);

export type InboxThreadIdentityInput = {
    primaryEntityType: string;
    primaryEntityId: string;
    channel: string;
    recipientKey: string | null;
    entityLabel: string | null;
    familyDisplay: string | null;
    locationDisplay: string | null;
    statusDisplay: string | null;
    personNames: Map<string, string>;
    primaryPersonByOpportunity: Map<string, string>;
    primaryPersonByJob: Map<string, string>;
    channelContactFallback: () => string | null;
    messageContactPersonId?: string | null;
};

/** Primary row label — message contact/person first; household never primary when person exists. */
export function resolveInboxPrimaryName(input: InboxThreadIdentityInput): string {
    const type = input.primaryEntityType.trim().toLowerCase();
    const id = input.primaryEntityId;
    const sanitizedEntity = sanitizeInboxEntityLabel(input.entityLabel);
    const family = sanitizeInboxEntityLabel(input.familyDisplay) ?? input.familyDisplay?.trim() ?? null;
    const contact = input.channelContactFallback();

    const messageContactId = input.messageContactPersonId?.trim();
    if (messageContactId && input.personNames.has(messageContactId)) {
        return input.personNames.get(messageContactId)!;
    }

    if (type === "persons" && UUID_RE.test(id)) {
        return input.personNames.get(id) ?? contact ?? "Conversation";
    }

    if (type === "opportunities" && UUID_RE.test(id)) {
        const personId = input.primaryPersonByOpportunity.get(id);
        if (personId && input.personNames.has(personId)) {
            return input.personNames.get(personId)!;
        }
        if (contact) return contact;
        if (sanitizedEntity) return sanitizedEntity;
        return "Conversation";
    }

    if (type === "jobs" && UUID_RE.test(id)) {
        const personId = input.primaryPersonByJob.get(id);
        if (personId && input.personNames.has(personId)) {
            return input.personNames.get(personId)!;
        }
        if (contact) return contact;
        if (sanitizedEntity) return sanitizedEntity;
        return "Conversation";
    }

    if (type === "customers") {
        if (contact) return contact;
        if (family) return family;
        if (sanitizedEntity) return sanitizedEntity;
        return "Conversation";
    }

    if (contact) return contact;
    if (sanitizedEntity) return sanitizedEntity;
    if (family) return family;
    return "Conversation";
}

/** Secondary line — location and configured status only. */
export function buildInboxContextLine(parts: {
    locationDisplay?: string | null;
    statusDisplay?: string | null;
}): string | null {
    const bits: string[] = [];
    const location = parts.locationDisplay?.trim();
    const status = parts.statusDisplay?.trim();
    if (location) bits.push(location);
    if (status && status !== location) bits.push(status);
    return bits.length > 0 ? bits.join(" · ") : null;
}

export function buildInboxPreviewLead(channel: string, preview: InboxMessagePreview | null): string {
    const ch = channelLabelShort(channel);
    const snippet = previewSnippetText(preview?.body ?? null);
    return `${ch} · ${snippet}`;
}

function channelLabelShort(ch: string): string {
    const c = ch.trim().toLowerCase();
    if (c === "email") return "Email";
    if (c === "sms") return "SMS";
    if (c === "in_app") return "Internal";
    return ch || "Message";
}

function previewSnippetText(body: string | null, max = 110): string {
    if (!body?.trim()) return "No message preview";
    const t = body.replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function resolveInboxRecordLabel(
    primaryName: string,
    entityLabel: string | null | undefined
): string | null {
    const record = sanitizeInboxEntityLabel(entityLabel);
    if (!record) return null;
    if (record === primaryName.trim()) return null;
    return record;
}

/**
 * What a reply on this thread may carry — and never an address.
 *
 * This shape used to expose a `toAddress` lifted out of `recipient_key`, and the
 * reply box put it on the wire as `to`. The send route refuses `to` outright
 * (free text is how a send reaches an unconsented destination with no person to
 * evaluate), so that field could only ever produce a rejected send. It is gone
 * rather than merely unused: while the address is reachable from this shape, the
 * next caller can put it back.
 *
 * Exactly one authority is set when `canReply`:
 *   person — a resolved Person; the server derives the address from their record
 *   thread — an unattributed conversation; the server derives the address from
 *            the inbound message it actually received on that thread
 */
export type InboxReplyAuthorityKind = "person" | "thread" | "none";

export type InboxReplyTarget = {
    canReply: boolean;
    entityType: "opportunities" | "jobs" | "persons" | null;
    entityId: string | null;
    authority: InboxReplyAuthorityKind;
    recipientPersonId: string | null;
    threadId: string | null;
    /** "Jordan Smith" or "ending in 1234". Never the number or address itself. */
    displayLabel: string | null;
    disabledReason: string | null;
    channel: "email" | "sms" | "in_app" | null;
};

type ReplyTargetThread = Pick<
    InboxThreadListItem,
    | "id"
    | "primary_entity_type"
    | "primary_entity_id"
    | "channel"
    | "recipient_key"
    | "reply_person_id"
    | "channel_contact_display"
    | "reply_email_available"
    | "reply_sms_available"
> &
    Partial<Pick<InboxThreadListItem, "sender_identity_state" | "contact_display">>;

function unreplyable(
    reason: string,
    channel: InboxReplyTarget["channel"],
    entity?: { entityType: InboxReplyTarget["entityType"]; entityId: string | null }
): InboxReplyTarget {
    return {
        canReply: false,
        entityType: entity?.entityType ?? null,
        entityId: entity?.entityId ?? null,
        authority: "none",
        recipientPersonId: null,
        threadId: null,
        displayLabel: null,
        disabledReason: reason,
        channel,
    };
}

export function resolveInboxReplyTarget(
    thread: ReplyTargetThread,
    channelOverride?: string | null
): InboxReplyTarget {
    const channel = (channelOverride ?? thread.channel).trim().toLowerCase();

    if (channel === "in_app") {
        return unreplyable("Internal messages reply in record drawers (coming soon).", "in_app");
    }

    if (channel !== "email" && channel !== "sms") {
        return unreplyable("This channel cannot be replied to from the inbox yet.", null);
    }

    const entityType = thread.primary_entity_type.trim().toLowerCase();
    const entityId = thread.primary_entity_id.trim();
    const unidentified =
        thread.sender_identity_state === "unidentified" || entityType === UNKNOWN_SENDER_ENTITY_TYPE;

    // ------------------------------------------------------------- thread mode
    //
    // Checked before the person-oriented gates below, because every one of them
    // asks a question about a Person and an unattributed conversation has none.
    // Channel availability is likewise a fact about a Person's record, so it is
    // not consulted here: the destination is the endpoint that wrote to us.
    if (unidentified) {
        // A reply must go out on the channel the message came in on. There is no
        // second endpoint for this sender to switch to.
        if (channel !== thread.channel.trim().toLowerCase()) {
            return unreplyable(
                "This conversation can only be answered on the channel it arrived on.",
                channel
            );
        }
        if (!UUID_RE.test(thread.id.trim())) {
            return unreplyable("No reply path for this conversation.", channel);
        }
        return {
            canReply: true,
            entityType: null,
            entityId: null,
            authority: "thread",
            recipientPersonId: null,
            threadId: thread.id.trim(),
            displayLabel: maskInboxEndpointForDisplay(thread.recipient_key, channel),
            disabledReason: null,
            channel,
        };
    }

    // ------------------------------------------------------------- person mode
    if (channel === "email" && thread.reply_email_available === false) {
        return unreplyable("No email address available for this contact.", "email");
    }

    if (channel === "sms" && thread.reply_sms_available === false) {
        return unreplyable("No mobile number available for this contact.", "sms");
    }

    if (!REPLY_ENTITY_TYPES.has(entityType) || !UUID_RE.test(entityId)) {
        return unreplyable("No reply path for this conversation record.", channel);
    }

    const recipientPersonId =
        thread.reply_person_id?.trim() && UUID_RE.test(thread.reply_person_id.trim())
            ? thread.reply_person_id.trim()
            : entityType === "persons"
              ? entityId
              : null;

    if (!recipientPersonId) {
        // No Person and not flagged unattributed — the thread is internally
        // inconsistent, so nothing is sent. Falling back to the address here is
        // exactly the free-text path the send route refuses.
        return unreplyable("No recipient on file for this conversation.", channel, {
            entityType: entityType as InboxReplyTarget["entityType"],
            entityId,
        });
    }

    return {
        canReply: true,
        entityType: entityType as InboxReplyTarget["entityType"],
        entityId,
        authority: "person",
        recipientPersonId,
        threadId: null,
        displayLabel: thread.contact_display?.trim() || null,
        disabledReason: null,
        channel,
    };
}

/** Helper factory for resolveInboxPrimaryName channel fallback. */
export function inboxIdentityWithChannelFallback(
    input: Omit<InboxThreadIdentityInput, "channelContactFallback"> & {
        channelContact: string | null;
        messageContactPersonId?: string | null;
    }
): InboxThreadIdentityInput {
    const contact = input.channelContact;
    return {
        ...input,
        channelContactFallback: () => contact,
    };
}

export function defaultInboxReplyChannel(thread: Pick<InboxThreadListItem, "channel">): "email" | "sms" {
    const ch = thread.channel.trim().toLowerCase();
    if (ch === "sms") return "sms";
    return "email";
}
