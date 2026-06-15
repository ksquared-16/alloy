// UI-5B — I/O: load all communication threads for a family (customer + family persons + opportunities)
// and their recent messages. Read-only.
import { createAdminClient } from "@/lib/supabaseAdmin";
import { rollupRecipientReceipts, markUnreadFromReads, type RawThreadRow, type RawMessageRow, type RawRecipientReceiptRow } from "./aggregateFamilyTimeline";

type AdminSupabase = ReturnType<typeof createAdminClient>;
const THREAD_CAP = 50;
const MESSAGE_CAP = 300;
const THREAD_COLS = "id, primary_entity_type, primary_entity_id, channel, last_message_at, attention_state, sla_state, metadata";

export async function loadFamilyThreadsData(
    supabase: AdminSupabase,
    orgId: string,
    args: { customerId: string; personIds: string[]; opportunityIds: string[]; viewerUserId?: string | null }
): Promise<{ threads: RawThreadRow[]; messages: RawMessageRow[] }> {
    const personIds = Array.from(new Set(args.personIds.filter(Boolean)));
    const opportunityIds = Array.from(new Set(args.opportunityIds.filter(Boolean)));

    const [customerThreadsRes, personThreadsRes, opportunityThreadsRes] = await Promise.all([
        supabase.from("communication_threads").select(THREAD_COLS).eq("org_id", orgId).eq("primary_entity_type", "customer").eq("primary_entity_id", args.customerId).limit(THREAD_CAP),
        personIds.length
            ? supabase.from("communication_threads").select(THREAD_COLS).eq("org_id", orgId).in("primary_entity_type", ["person", "child"]).in("primary_entity_id", personIds).limit(THREAD_CAP)
            : Promise.resolve({ data: [] as RawThreadRow[] }),
        opportunityIds.length
            ? supabase.from("communication_threads").select(THREAD_COLS).eq("org_id", orgId).eq("primary_entity_type", "opportunity").in("primary_entity_id", opportunityIds).limit(THREAD_CAP)
            : Promise.resolve({ data: [] as RawThreadRow[] }),
    ]);

    const byId = new Map<string, RawThreadRow>();
    for (const row of [
        ...((customerThreadsRes.data ?? []) as RawThreadRow[]),
        ...((personThreadsRes.data ?? []) as RawThreadRow[]),
        ...((opportunityThreadsRes.data ?? []) as RawThreadRow[]),
    ]) {
        if (row.id && !byId.has(row.id)) byId.set(row.id, row);
    }
    const threads = Array.from(byId.values());
    const threadIds = threads.map((t) => t.id).filter(Boolean);

    const messagesRes = threadIds.length
        ? await supabase
              .from("communication_messages")
              .select("id, thread_id, direction, channel, body, created_at, delivered_at, sent_at, status, metadata")
              .eq("org_id", orgId)
              .in("thread_id", threadIds)
              .order("created_at", { ascending: false })
              .limit(MESSAGE_CAP)
        : { data: [] as RawMessageRow[] };

    const messages = (messagesRes.data ?? []) as RawMessageRow[];

    // UI-5H: roll per-recipient receipts (delivered/opened/replied) up onto each message.
    const messageIds = messages.map((m) => m.id).filter(Boolean);
    if (messageIds.length > 0) {
        const receiptsRes = await supabase
            .from("communication_message_recipients")
            .select("message_id, status, delivered_at, opened_at, replied_at")
            .eq("org_id", orgId)
            .in("message_id", messageIds)
            .limit(MESSAGE_CAP * 2);
        const rollup = rollupRecipientReceipts((receiptsRes.data ?? []) as RawRecipientReceiptRow[]);
        for (const m of messages) {
            const r = rollup[m.id];
            if (!r) continue;
            m.delivered_at = r.deliveredAt ?? m.delivered_at ?? null;
            m.opened_at = r.openedAt ?? m.opened_at ?? null;
            m.replied_at = r.repliedAt ?? m.replied_at ?? null;
        }
    }

    // P6 — per-viewer unread: an inbound message is unread until the viewer has a read receipt.
    const viewerUserId = (args.viewerUserId ?? "").trim();
    if (viewerUserId && messages.length > 0) {
        const inboundIds = messages.filter((m) => (m.direction ?? "") === "inbound").map((m) => m.id).filter(Boolean);
        if (inboundIds.length > 0) {
            const readsRes = await supabase
                .from("communication_message_reads")
                .select("message_id")
                .eq("user_id", viewerUserId)
                .in("message_id", inboundIds);
            const readSet = new Set(((readsRes.data ?? []) as Array<{ message_id?: string | null }>).map((r) => String(r.message_id ?? "")).filter(Boolean));
            markUnreadFromReads(messages, readSet);
        }
    }

    return { threads, messages };
}
