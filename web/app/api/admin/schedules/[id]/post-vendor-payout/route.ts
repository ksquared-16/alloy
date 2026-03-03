import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { postVendorPayoutCashForSchedule, type PostCashEventError } from "@/lib/admin/postCashEvent";

function isPostError(result: { entry_id?: string; code?: string }): result is PostCashEventError {
    return !("entry_id" in result && result.entry_id);
}

/**
 * POST: Post vendor payout (cash out) for a completed schedule. Idempotent.
 * Auth: getAdminContext(); requires admin. Requires schedule status_key === 'completed' (case-insensitive).
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

    return NextResponse.json(result);
}
