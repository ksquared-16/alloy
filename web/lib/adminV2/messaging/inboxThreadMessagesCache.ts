export type InboxThreadMessageRow = {
    id: string;
    direction: string;
    channel: string;
    body: string | null;
    created_at: string | null;
};

export type InboxThreadMessagesCacheEntry = {
    messages: InboxThreadMessageRow[];
    fetchedAt: number;
    error: string | null;
    loading: boolean;
};

export const INBOX_THREAD_MESSAGES_FETCH_LIMIT = 100;

export function parseInboxThreadMessagesResponse(raw: unknown): InboxThreadMessageRow[] {
    const list = Array.isArray((raw as { messages?: unknown[] })?.messages)
        ? ((raw as { messages: unknown[] }).messages ?? [])
        : [];
    const rows: InboxThreadMessageRow[] = list.map((m) => {
        const row = m as Record<string, unknown>;
        return {
            id: String(row.id ?? ""),
            direction: String(row.direction ?? ""),
            channel: String(row.channel ?? ""),
            body: row.body != null ? String(row.body) : null,
            created_at: row.created_at != null ? String(row.created_at) : null,
        };
    });
    rows.sort((a, b) => Date.parse(String(a.created_at ?? 0)) - Date.parse(String(b.created_at ?? 0)));
    return rows;
}
