/**
 * Reopen lifecycle stage work with a new due date (repeat / retry flow).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOperationalTaskById } from "@/lib/admin/operationalTasksService";

export type ReopenStageWorkWithDueDateInput = {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    dueDays: number;
    now?: Date;
};

export type ReopenStageWorkWithDueDateResult = { ok: true; due_at: string } | { ok: false; error: string };

function addDays(base: Date, days: number): Date {
    const next = new Date(base.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

export async function reopenStageWorkWithDueDate(
    input: ReopenStageWorkWithDueDateInput,
): Promise<ReopenStageWorkWithDueDateResult> {
    const workId = input.workId.trim();
    if (!workId) return { ok: false, error: "workId is required" };

    const loaded = await getOperationalTaskById({
        supabase: input.supabase,
        orgId: input.orgId,
        taskId: workId,
    });
    if (!loaded.ok) return { ok: false, error: loaded.message ?? loaded.error };

    const dueDays = Math.max(0, Math.floor(input.dueDays));
    const due_at = addDays(input.now ?? new Date(), dueDays).toISOString();

    const { data, error } = await input.supabase
        .from("operational_tasks")
        .update({ due_at, status: "open", updated_at: new Date().toISOString() })
        .eq("org_id", input.orgId)
        .eq("id", workId)
        .select("id")
        .maybeSingle();

    if (error || !data) return { ok: false, error: error?.message ?? "Failed to reopen work" };
    return { ok: true, due_at };
}
