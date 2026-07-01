/**
 * Orphan communication row selection for DEMO_CLEANUP_MODE=communications_orphan_reset.
 * Targets threads/messages with missing primary entities and unlinked scheduled sends.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk, isGoldenPathProtectedMetadata } from "./demoRuntimeCleanupScope";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type OrphanThreadRow = {
    id: string;
    channel: string;
    recipient_key: string | null;
    primary_entity_type: string;
    primary_entity_id: string;
    orphan_reason: "invalid_entity_id" | "unknown_entity_type" | "missing_primary_entity";
    message_count: number;
    last_preview: string | null;
};

export type OrphanScheduledSendRow = {
    id: string;
    entity_id: string;
    recipient_person_id: string;
    channel: string;
    status: string;
    orphan_reason: "missing_entity" | "missing_recipient_person" | "orphan_message_link";
};

export type CommunicationsOrphanSelection = {
    threadIds: string[];
    messageIds: string[];
    scheduledSendIds: string[];
    messagesOutboxIds: string[];
    selectedThreads: OrphanThreadRow[];
    excludedGoldenPathThreads: Array<{
        id: string;
        primary_entity_type: string;
        primary_entity_id: string;
        channel: string;
        entity_label: string | null;
    }>;
    orphanScheduledSends: OrphanScheduledSendRow[];
    counts: {
        communication_message_reads: number;
        communication_messages: number;
        communication_scheduled_sends: number;
        messages_outbox: number;
        communication_threads: number;
    };
};

type EntityTable = "opportunities" | "persons" | "customers" | "jobs";

type RawThread = {
    id: string;
    channel: string;
    recipient_key: string | null;
    primary_entity_type: string;
    primary_entity_id: string;
    metadata?: unknown;
};

function resolveEntityTable(entityType: string): EntityTable | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunities" || t === "opportunity") return "opportunities";
    if (t === "persons" || t === "person" || t === "child") return "persons";
    if (t === "customers" || t === "customer") return "customers";
    if (t === "jobs" || t === "job") return "jobs";
    return null;
}

async function loadAllOrgThreads(supabase: SupabaseAdmin, orgId: string): Promise<RawThread[]> {
    const all: RawThread[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("communication_threads")
            .select("id, channel, recipient_key, primary_entity_type, primary_entity_id, metadata")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[communication_threads select] ${error.message}`);
        for (const r of data ?? []) {
            all.push(r as RawThread);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return all;
}

async function loadExistingIds(
    supabase: SupabaseAdmin,
    table: EntityTable,
    orgId: string,
    ids: string[]
): Promise<Map<string, unknown>> {
    const metaById = new Map<string, unknown>();
    if (!ids.length) return metaById;
    const cols =
        table === "opportunities"
            ? "id, metadata"
            : table === "jobs"
              ? "id"
              : table === "persons"
                ? "id, metadata"
                : "id, metadata";
    for (const part of chunk(ids, 200)) {
        const { data, error } = await supabase.from(table).select(cols).eq("org_id", orgId).in("id", part);
        if (error) throw new Error(`[${table} existence] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { id?: string; metadata?: unknown };
            if (row.id) metaById.set(row.id, row.metadata ?? null);
        }
    }
    return metaById;
}

async function loadOpportunityLabels(
    supabase: SupabaseAdmin,
    orgId: string,
    oppIds: string[]
): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    for (const part of chunk(oppIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, name, metadata")
            .eq("org_id", orgId)
            .in("id", part);
        if (error) throw new Error(`[opportunities labels] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { id?: string; name?: string | null };
            if (row.id) labels.set(row.id, (row.name ?? "").trim() || "Opportunity");
        }
    }
    return labels;
}

async function loadMessageSummaries(
    supabase: SupabaseAdmin,
    orgId: string,
    threadIds: string[]
): Promise<Map<string, { count: number; preview: string | null }>> {
    const out = new Map<string, { count: number; preview: string | null }>();
    for (const id of threadIds) out.set(id, { count: 0, preview: null });
    if (!threadIds.length) return out;

    for (const part of chunk(threadIds, 150)) {
        const { data, error } = await supabase
            .from("communication_messages")
            .select("id, thread_id, body, created_at")
            .eq("org_id", orgId)
            .in("thread_id", part)
            .order("created_at", { ascending: false });
        if (error) throw new Error(`[communication_messages thread summary] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { thread_id?: string; body?: string | null };
            const tid = row.thread_id ?? "";
            if (!tid) continue;
            const cur = out.get(tid) ?? { count: 0, preview: null };
            cur.count += 1;
            if (!cur.preview) {
                const body = typeof row.body === "string" ? row.body.trim() : "";
                cur.preview = body.length > 80 ? `${body.slice(0, 77)}…` : body || null;
            }
            out.set(tid, cur);
        }
    }
    return out;
}

async function loadMessageIdsForThreads(
    supabase: SupabaseAdmin,
    orgId: string,
    threadIds: string[]
): Promise<string[]> {
    const ids: string[] = [];
    for (const part of chunk(threadIds, 150)) {
        const { data, error } = await supabase
            .from("communication_messages")
            .select("id")
            .eq("org_id", orgId)
            .in("thread_id", part);
        if (error) throw new Error(`[communication_messages ids] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.push(id);
        }
    }
    return ids;
}

async function countReadsForMessages(supabase: SupabaseAdmin, messageIds: string[]): Promise<number> {
    if (!messageIds.length) return 0;
    let total = 0;
    for (const part of chunk(messageIds, 200)) {
        const { count, error } = await supabase
            .from("communication_message_reads")
            .select("*", { count: "exact", head: true })
            .in("message_id", part);
        if (error) throw new Error(`[communication_message_reads count] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

async function loadExistingOpportunityIds(supabase: SupabaseAdmin, orgId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[opportunities ids] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return ids;
}

async function loadExistingPersonIds(supabase: SupabaseAdmin, orgId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[persons ids] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return ids;
}

async function loadOpportunityGoldenPathIds(
    supabase: SupabaseAdmin,
    orgId: string,
    oppIds: string[]
): Promise<Set<string>> {
    const golden = new Set<string>();
    for (const part of chunk(oppIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, metadata")
            .eq("org_id", orgId)
            .in("id", part);
        if (error) throw new Error(`[opportunities golden-path] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { id?: string; metadata?: unknown };
            if (row.id && isGoldenPathProtectedMetadata(row.metadata)) golden.add(row.id);
        }
    }
    return golden;
}

async function resolveOrphanScheduledSends(
    supabase: SupabaseAdmin,
    orgId: string,
    existingOppIds: Set<string>,
    existingPersonIds: Set<string>,
    goldenOppIds: Set<string>,
    orphanMessageIds: Set<string>
): Promise<OrphanScheduledSendRow[]> {
    const rows: OrphanScheduledSendRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("communication_scheduled_sends")
            .select("id, entity_id, recipient_person_id, channel, status, communication_message_id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[communication_scheduled_sends select] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as {
                id?: string;
                entity_id?: string;
                recipient_person_id?: string;
                channel?: string;
                status?: string;
                communication_message_id?: string | null;
            };
            const id = row.id;
            const entityId = row.entity_id ?? "";
            const personId = row.recipient_person_id ?? "";
            if (!id) continue;
            if (goldenOppIds.has(entityId)) continue;

            let reason: OrphanScheduledSendRow["orphan_reason"] | null = null;
            if (!existingOppIds.has(entityId)) reason = "missing_entity";
            else if (!existingPersonIds.has(personId)) reason = "missing_recipient_person";
            else if (row.communication_message_id && orphanMessageIds.has(row.communication_message_id)) {
                reason = "orphan_message_link";
            }
            if (!reason) continue;
            rows.push({
                id,
                entity_id: entityId,
                recipient_person_id: personId,
                channel: String(row.channel ?? ""),
                status: String(row.status ?? ""),
                orphan_reason: reason,
            });
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return rows;
}

async function resolveOrphanMessagesOutboxIds(
    supabase: SupabaseAdmin,
    orgId: string,
    orphanMessageIds: string[],
    existingByTable: Record<EntityTable, Map<string, unknown>>
): Promise<string[]> {
    const orphanRunIds = new Set<string>();

    for (const part of chunk(orphanMessageIds, 200)) {
        const { data, error } = await supabase
            .from("communication_messages")
            .select("workflow_run_id")
            .eq("org_id", orgId)
            .in("id", part);
        if (error) throw new Error(`[communication_messages workflow_run_id] ${error.message}`);
        for (const r of data ?? []) {
            const runId = (r as { workflow_run_id?: string | null }).workflow_run_id;
            if (runId && UUID_RE.test(runId)) orphanRunIds.add(runId);
        }
    }

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("workflow_events")
            .select("id, entity_type, entity_id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[workflow_events orphan scan] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { id?: string; entity_type?: string | null; entity_id?: string | null };
            const eventId = row.id;
            const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
            const entityType = typeof row.entity_type === "string" ? row.entity_type : "";
            if (!eventId || !UUID_RE.test(entityId)) continue;
            const table = resolveEntityTable(entityType);
            if (!table) continue;
            if (!existingByTable[table].has(entityId)) {
                const { data: runs, error: runErr } = await supabase
                    .from("workflow_runs")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("event_id", eventId);
                if (runErr) throw new Error(`[workflow_runs by orphan event] ${runErr.message}`);
                for (const wr of runs ?? []) {
                    const rid = (wr as { id?: string }).id;
                    if (rid) orphanRunIds.add(rid);
                }
            }
        }
        if (!data?.length || data.length < pageSize) break;
    }

    if (!orphanRunIds.size) return [];

    const outboxIds: string[] = [];
    for (const part of chunk([...orphanRunIds], 200)) {
        const { data, error } = await supabase
            .from("messages_outbox")
            .select("id")
            .eq("org_id", orgId)
            .in("workflow_run_id", part);
        if (error) throw new Error(`[messages_outbox orphan] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) outboxIds.push(id);
        }
    }
    return outboxIds;
}

export async function buildCommunicationsOrphanSelection(
    supabase: SupabaseAdmin,
    orgId: string
): Promise<CommunicationsOrphanSelection> {
    const threads = await loadAllOrgThreads(supabase, orgId);

    const idsByTable: Record<EntityTable, Set<string>> = {
        opportunities: new Set(),
        persons: new Set(),
        customers: new Set(),
        jobs: new Set(),
    };

    for (const t of threads) {
        const table = resolveEntityTable(t.primary_entity_type);
        if (table && UUID_RE.test(t.primary_entity_id)) {
            idsByTable[table].add(t.primary_entity_id);
        }
    }

    const existingByTable: Record<EntityTable, Map<string, unknown>> = {
        opportunities: await loadExistingIds(supabase, "opportunities", orgId, [...idsByTable.opportunities]),
        persons: await loadExistingIds(supabase, "persons", orgId, [...idsByTable.persons]),
        customers: await loadExistingIds(supabase, "customers", orgId, [...idsByTable.customers]),
        jobs: await loadExistingIds(supabase, "jobs", orgId, [...idsByTable.jobs]),
    };

    const goldenOppIds = await loadOpportunityGoldenPathIds(supabase, orgId, [...idsByTable.opportunities]);
    const oppLabels = await loadOpportunityLabels(supabase, orgId, [...idsByTable.opportunities]);

    const selectedThreads: OrphanThreadRow[] = [];
    const excludedGoldenPathThreads: CommunicationsOrphanSelection["excludedGoldenPathThreads"] = [];
    const threadIds: string[] = [];

    for (const t of threads) {
        const entityId = t.primary_entity_id;
        if (!UUID_RE.test(entityId)) {
            threadIds.push(t.id);
            selectedThreads.push({
                id: t.id,
                channel: t.channel,
                recipient_key: t.recipient_key,
                primary_entity_type: t.primary_entity_type,
                primary_entity_id: entityId,
                orphan_reason: "invalid_entity_id",
                message_count: 0,
                last_preview: null,
            });
            continue;
        }

        const table = resolveEntityTable(t.primary_entity_type);
        if (!table) {
            threadIds.push(t.id);
            selectedThreads.push({
                id: t.id,
                channel: t.channel,
                recipient_key: t.recipient_key,
                primary_entity_type: t.primary_entity_type,
                primary_entity_id: entityId,
                orphan_reason: "unknown_entity_type",
                message_count: 0,
                last_preview: null,
            });
            continue;
        }

        if (!existingByTable[table].has(entityId)) {
            threadIds.push(t.id);
            selectedThreads.push({
                id: t.id,
                channel: t.channel,
                recipient_key: t.recipient_key,
                primary_entity_type: t.primary_entity_type,
                primary_entity_id: entityId,
                orphan_reason: "missing_primary_entity",
                message_count: 0,
                last_preview: null,
            });
            continue;
        }

        const metadata = existingByTable[table].get(entityId);
        if ((table === "opportunities" && goldenOppIds.has(entityId)) || isGoldenPathProtectedMetadata(metadata)) {
            excludedGoldenPathThreads.push({
                id: t.id,
                primary_entity_type: t.primary_entity_type,
                primary_entity_id: entityId,
                channel: t.channel,
                entity_label: table === "opportunities" ? (oppLabels.get(entityId) ?? null) : null,
            });
        }
    }

    const msgSummaries = await loadMessageSummaries(supabase, orgId, threadIds);
    for (const row of selectedThreads) {
        const s = msgSummaries.get(row.id);
        if (s) {
            row.message_count = s.count;
            row.last_preview = s.preview;
        }
    }
    selectedThreads.sort((a, b) => (a.last_preview ?? "").localeCompare(b.last_preview ?? ""));

    const messageIds = await loadMessageIdsForThreads(supabase, orgId, threadIds);
    const orphanMessageIdSet = new Set(messageIds);

    const existingOppIds = await loadExistingOpportunityIds(supabase, orgId);
    const existingPersonIds = await loadExistingPersonIds(supabase, orgId);

    const [readCount, orphanScheduledSends, messagesOutboxIds] = await Promise.all([
        countReadsForMessages(supabase, messageIds),
        resolveOrphanScheduledSends(supabase, orgId, existingOppIds, existingPersonIds, goldenOppIds, orphanMessageIdSet),
        resolveOrphanMessagesOutboxIds(supabase, orgId, messageIds, existingByTable),
    ]);

    const scheduledSendIds = orphanScheduledSends.map((r) => r.id);

    return {
        threadIds,
        messageIds,
        scheduledSendIds,
        messagesOutboxIds,
        selectedThreads,
        excludedGoldenPathThreads,
        orphanScheduledSends,
        counts: {
            communication_message_reads: readCount,
            communication_messages: messageIds.length,
            communication_scheduled_sends: scheduledSendIds.length,
            messages_outbox: messagesOutboxIds.length,
            communication_threads: threadIds.length,
        },
    };
}
