import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    postScheduleCompletion,
    isPostScheduleCompletionError,
    isPostScheduleCompletionSkipped,
} from "@/lib/admin/postScheduleCompletion";

/**
 * POST: Post GL journal entry for a completed schedule (idempotent).
 * Auth: getAdminContext(); requires admin (canMutate).
 * Validates schedule is completed, then creates/updates gl_journal_entry + lines.
 */
export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const supabase = createAdminClient();
    const result = await postScheduleCompletion({
        supabase,
        orgId: ctx.orgId,
        scheduleId,
    });

    if (isPostScheduleCompletionError(result)) {
        if (result.code === "schedule_not_found") {
            return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
        }
        if (result.code === "schedule_not_completed") {
            return NextResponse.json(
                { error: `Schedule is not completed (status_key: ${result.status_key ?? "null"})` },
                { status: 400 }
            );
        }
        if (result.code === "job_not_found") {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        if (result.code === "missing_mappings") {
            return NextResponse.json(
                { error: `Missing GL account mappings: ${result.keys.join(", ")}` },
                { status: 400 }
            );
        }
        if (result.code === "entry_unbalanced") {
            return NextResponse.json(
                {
                    error: "GL entry would be unbalanced",
                    total_debits: result.total_debits,
                    total_credits: result.total_credits,
                },
                { status: 500 }
            );
        }
    }

    if (isPostScheduleCompletionSkipped(result)) {
        return NextResponse.json({
            ok: true,
            skipped: true,
            reason: result.reason,
            schedule_id: result.schedule_id,
        });
    }

    return NextResponse.json(result);
}
