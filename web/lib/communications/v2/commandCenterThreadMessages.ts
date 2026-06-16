/** Client-side thread timeline fetch for Command Center (thread-scoped fallback). */
export type CommandCenterTimelineMessage = {
    id?: string;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    opened_at?: string | null;
    replied_at?: string | null;
    kind?: string | null;
    thread_id?: string | null;
    status?: string | null;
};

export async function fetchCommandCenterThreadMessages(threadId: string): Promise<CommandCenterTimelineMessage[]> {
    const res = await fetch(`/api/admin/communications/threads/${encodeURIComponent(threadId)}/messages`, {
        credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: CommandCenterTimelineMessage[] } | CommandCenterTimelineMessage[];
    const list = Array.isArray(data) ? data : (data.messages ?? []);
    return [...list].reverse();
}
