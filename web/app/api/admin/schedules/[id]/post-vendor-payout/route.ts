import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";
import { postVendorPayoutCashForSchedule, type PostCashEventError } from "@/lib/admin/postCashEvent";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingScheduleMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

function isPostError(result: { entry_id?: string; code?: string }): result is PostCashEventError {
    return !("entry_id" in result && result.entry_id);
}

/**
 * POST: Post vendor payout (cash out) for a completed schedule. Idempotent.
 * Auth: getAdminContextCached(); requires admin. Requires schedule status_key === 'completed' (case-insensitive).
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

    const result = await postVendorPayoutCashForSchedule({
        supabase,
        orgId: ctx.orgId,
        scheduleId,
    });

    if (isPostError(result)) {
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
    }

    const okResult = result as { entry_id: string; ledger_transaction_id: string; schedule_id: string; amount_cents: number; mapping_keys_used: string[] };
    try {
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "schedule_vendor_payout_gl_posted",
            entity_type: "schedule",
            entity_id: scheduleId,
            payload: {
                gl_journal_entry_id: okResult.entry_id,
                ledger_transaction_id: okResult.ledger_transaction_id,
                amount_cents: okResult.amount_cents,
                mapping_keys_used: okResult.mapping_keys_used,
                actor_user_id: ctx.userId,
            },
        });
    } catch (e) {
        console.warn("[post-vendor-payout] emitEvent", e instanceof Error ? e.message : e);
    }

    return NextResponse.json(result);
}
