import type { InboxMessagePreview, InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";
import { sanitizeInboxEntityLabel } from "@/lib/communications/inboxThreadDisplayLabels";

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

export type InboxReplyTarget = {
    canReply: boolean;
    entityType: "opportunities" | "jobs" | "persons" | null;
    entityId: string | null;
    recipientPersonId: string | null;
    toAddress: string | null;
    disabledReason: string | null;
    channel: "email" | "sms" | "in_app" | null;
};

export function resolveInboxReplyTarget(
    thread: Pick<
        InboxThreadListItem,
        | "primary_entity_type"
        | "primary_entity_id"
        | "channel"
        | "recipient_key"
        | "reply_person_id"
        | "channel_contact_display"
        | "reply_email_available"
        | "reply_sms_available"
    >,
    channelOverride?: string | null
): InboxReplyTarget {
    const channel = (channelOverride ?? thread.channel).trim().toLowerCase();

    if (channel === "in_app") {
        return {
            canReply: false,
            entityType: null,
            entityId: null,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "Internal messages reply in record drawers (coming soon).",
            channel: "in_app",
        };
    }

    if (channel !== "email" && channel !== "sms") {
        return {
            canReply: false,
            entityType: null,
            entityId: null,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "This channel cannot be replied to from the inbox yet.",
            channel: null,
        };
    }

    if (channel === "email" && thread.reply_email_available === false) {
        return {
            canReply: false,
            entityType: null,
            entityId: null,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "No email address available for this contact.",
            channel: "email",
        };
    }

    if (channel === "sms" && thread.reply_sms_available === false) {
        return {
            canReply: false,
            entityType: null,
            entityId: null,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "No mobile number available for this contact.",
            channel: "sms",
        };
    }

    const entityType = thread.primary_entity_type.trim().toLowerCase();
    const entityId = thread.primary_entity_id.trim();
    if (!REPLY_ENTITY_TYPES.has(entityType) || !UUID_RE.test(entityId)) {
        return {
            canReply: false,
            entityType: null,
            entityId: null,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "No reply path for this conversation record.",
            channel: channel as "email" | "sms",
        };
    }

    const recipientPersonId =
        thread.reply_person_id?.trim() && UUID_RE.test(thread.reply_person_id.trim())
            ? thread.reply_person_id.trim()
            : entityType === "persons"
              ? entityId
              : null;

    const key = (thread.recipient_key ?? "").trim();
    let toAddress: string | null = null;
    if (key && key !== "_empty" && key !== "_in_app") {
        if (channel === "email" && key.includes("@")) toAddress = key;
        if (channel === "sms" && !key.includes("@")) toAddress = key;
    }
    if (!toAddress && thread.channel_contact_display?.trim()) {
        const contact = thread.channel_contact_display.trim();
        if (channel === "email" && contact.includes("@")) toAddress = contact;
        if (channel === "sms" && !contact.includes("@")) toAddress = contact;
    }

    if (!recipientPersonId && !toAddress) {
        return {
            canReply: false,
            entityType: entityType as InboxReplyTarget["entityType"],
            entityId,
            recipientPersonId: null,
            toAddress: null,
            disabledReason: "Missing recipient address for this thread.",
            channel: channel as "email" | "sms",
        };
    }

    return {
        canReply: true,
        entityType: entityType as InboxReplyTarget["entityType"],
        entityId,
        recipientPersonId,
        toAddress,
        disabledReason: null,
        channel: channel as "email" | "sms",
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
