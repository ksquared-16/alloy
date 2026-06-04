import type { SupabaseClient } from "@supabase/supabase-js";

import { listCommunicationScheduledSendsForEntity } from "@/lib/communications/communicationScheduledSendsService";
import type { RemindersSummaryVm } from "@/lib/adminV2/viewModel/drawer/types";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function nextFollowUpFromRecord(record: Record<string, unknown>): string | null {
    const top = record.next_follow_up_at;
    if (typeof top === "string" && top.trim()) return top.trim();
    const md = record.metadata;
    if (md && typeof md === "object") {
        const nested = (md as { next_follow_up_at?: unknown }).next_follow_up_at;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
}

export async function loadOpportunityScheduledSendsPreview(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    record: Record<string, unknown>;
}): Promise<RemindersSummaryVm> {
    const next_follow_up_iso = nextFollowUpFromRecord(params.record);
    const listed = await listCommunicationScheduledSendsForEntity({
        supabase: params.supabase,
        orgId: params.orgId,
        entityType: "opportunities",
        entityId: params.opportunityId,
    });

    const scheduled_sends =
        listed.ok ?
            listed.rows
                .filter((row) => {
                    const status = row.status.trim().toLowerCase();
                    return status === "pending" || status === "approved" || status === "scheduled";
                })
                .slice(0, 6)
                .map((row) => ({
                    id: row.id,
                    scheduled_for: row.scheduled_for,
                    status: row.status,
                    channel: row.channel,
                }))
        :   [];

    const hasReminderContent = Boolean(next_follow_up_iso) || scheduled_sends.length > 0;
    return {
        state: hasReminderContent ? "ready" : "empty",
        next_follow_up_iso,
        scheduled_send_count: scheduled_sends.length,
        scheduled_sends,
    };
}
