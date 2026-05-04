import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingScheduleMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    postScheduleCompletion,
    isPostScheduleCompletionError,
    isPostScheduleCompletionSkipped,
} from "@/lib/admin/postScheduleCompletion";

/**
 * POST: Post GL journal entry for a completed schedule (idempotent).
 * Auth: getAdminContextCached(); requires admin (canMutate).
 * Validates schedule is completed, then creates/updates gl_journal_entry + lines.
 */
export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
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

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json(
            { error: access.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: access.status }
        );
    }
    const dim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingScheduleMutableInAdminScope(supabase, ctx.orgId, dim, scheduleId))) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

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

    if (!isPostScheduleCompletionError(result) && "entry_id" in result && result.entry_id) {
        const r = result as {
            entry_id: string;
            schedule_id: string;
            gross_cents: number;
            discount_cents: number;
            net_cents: number;
            payout_percent: number;
            payout_cents: number;
            mapping_keys_used: string[];
        };
        try {
            await emitEvent({
                org_id: ctx.orgId,
                event_type: "schedule_completion_gl_posted",
                entity_type: "schedule",
                entity_id: scheduleId,
                payload: {
                    gl_journal_entry_id: r.entry_id,
                    gross_cents: r.gross_cents,
                    discount_cents: r.discount_cents,
                    net_cents: r.net_cents,
                    payout_cents: r.payout_cents,
                    mapping_keys_used: r.mapping_keys_used,
                    actor_user_id: ctx.userId,
                },
            });
        } catch (e) {
            console.warn("[post-completion] emitEvent", e instanceof Error ? e.message : e);
        }
    }

    return NextResponse.json(result);
}
