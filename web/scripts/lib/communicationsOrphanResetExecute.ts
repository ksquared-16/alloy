/**
 * FK-safe delete execution for communications_orphan_reset mode.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk } from "./demoRuntimeCleanupScope";
import type { CommunicationsOrphanSelection } from "./communicationsOrphanResetSelection";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function deleteByIn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).delete().in(column, part).select("id");
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

async function deleteReadsByMessageIds(supabase: SupabaseAdmin, messageIds: string[]): Promise<number> {
    if (!messageIds.length) return 0;
    let n = 0;
    for (const part of chunk(messageIds, 200)) {
        const { data, error } = await supabase
            .from("communication_message_reads")
            .delete()
            .in("message_id", part)
            .select("message_id");
        if (error) throw new Error(`[communication_message_reads delete] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

export async function executeCommunicationsOrphanDeletes(
    supabase: SupabaseAdmin,
    orgId: string,
    selection: CommunicationsOrphanSelection
): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};

    deleted.communication_message_reads = await deleteReadsByMessageIds(supabase, selection.messageIds);
    deleted.communication_messages = await deleteByIn(supabase, "communication_messages", "id", selection.messageIds, orgId);
    deleted.communication_scheduled_sends = await deleteByIn(
        supabase,
        "communication_scheduled_sends",
        "id",
        selection.scheduledSendIds,
        orgId
    );
    deleted.messages_outbox = await deleteByIn(
        supabase,
        "messages_outbox",
        "id",
        selection.messagesOutboxIds,
        orgId
    );
    deleted.communication_threads = await deleteByIn(
        supabase,
        "communication_threads",
        "id",
        selection.threadIds,
        orgId
    );

    return deleted;
}

export function printCommunicationsOrphanReport(selection: CommunicationsOrphanSelection): void {
    console.log("--- communications_orphan_reset selection ---\n");
    console.log(`orphan_threads: ${selection.selectedThreads.length}`);
    console.log(`orphan_messages: ${selection.messageIds.length}`);
    console.log(`orphan_message_reads: ${selection.counts.communication_message_reads}`);
    console.log(`orphan_scheduled_sends: ${selection.orphanScheduledSends.length}`);
    console.log(`orphan_messages_outbox: ${selection.messagesOutboxIds.length}`);
    console.log(`excluded_golden_path_threads: ${selection.excludedGoldenPathThreads.length}\n`);

    if (selection.selectedThreads.length) {
        console.log("Orphan threads (would delete):");
        for (const row of selection.selectedThreads) {
            console.log(
                `  - ${row.channel} | ${row.primary_entity_type}:${row.primary_entity_id} | reason=${row.orphan_reason} | msgs=${row.message_count} | preview=${row.last_preview ?? "—"} | id=${row.id}`
            );
        }
        console.log("");
    } else {
        console.log("Orphan threads (would delete): (none)\n");
    }

    if (selection.orphanScheduledSends.length) {
        console.log("Orphan scheduled sends (would delete):");
        for (const row of selection.orphanScheduledSends) {
            console.log(
                `  - ${row.channel} | status=${row.status} | entity=${row.entity_id} | person=${row.recipient_person_id} | reason=${row.orphan_reason} | id=${row.id}`
            );
        }
        console.log("");
    }

    if (selection.excludedGoldenPathThreads.length) {
        console.log("Excluded golden-path threads (protected):");
        for (const row of selection.excludedGoldenPathThreads) {
            console.log(
                `  - ${row.channel} | ${row.primary_entity_type}:${row.primary_entity_id} | ${row.entity_label ?? "golden_path"} | id=${row.id}`
            );
        }
        console.log("");
    }
}
