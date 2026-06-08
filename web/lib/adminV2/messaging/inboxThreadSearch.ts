import type { InboxThreadListItem } from "@/lib/communications/inboxThreadTypes";

function threadSearchHaystack(thread: InboxThreadListItem): string {
    return [
        thread.contact_display,
        thread.family_display,
        thread.context_display,
        thread.preview_lead,
        thread.related_children_display,
        thread.related_contacts_display,
        thread.channel_contact_display,
        thread.recipient_key,
        thread.last_message_preview?.body,
        thread.entity_chip?.label,
    ]
        .filter((v) => v != null && String(v).trim() !== "")
        .join(" ")
        .toLowerCase();
}

/** Client-side filter over loaded inbox threads (Sprint B QA). */
export function filterInboxThreadsBySearch(
    threads: InboxThreadListItem[],
    query: string
): InboxThreadListItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    const tokens = q.split(/\s+/).filter(Boolean);
    return threads.filter((thread) => {
        const haystack = threadSearchHaystack(thread);
        return tokens.every((token) => haystack.includes(token));
    });
}
