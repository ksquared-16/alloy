// UI-5B — I/O: load all communication threads for a family (customer + family persons + opportunities)
// and their recent messages. Read-only.
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { RawThreadRow, RawMessageRow } from "./aggregateFamilyTimeline";

type AdminSupabase = ReturnType<typeof createAdminClient>;
const THREAD_CAP = 50;
const MESSAGE_CAP = 300;
const THREAD_COLS = "id, primary_entity_type, primary_entity_id, channel, last_message_at, attention_state, sla_state, metadata";

export async function loadFamilyThreadsData(
    supabase: AdminSupabase,
    orgId: string,
    args: { customerId: string; personIds: string[]; opportunityIds: string[] }
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
              .select("id, thread_id, direction, channel, body, created_at, delivered_at, metadata")
              .eq("org_id", orgId)
              .in("thread_id", threadIds)
              .order("created_at", { ascending: false })
              .limit(MESSAGE_CAP)
        : { data: [] as RawMessageRow[] };

    return { threads, messages: (messagesRes.data ?? []) as RawMessageRow[] };
}
