import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { OrgSettingsRow } from "@/lib/admin/vendorPayoutPolicy";
import { vendorIsEligibleForAssignment } from "@/lib/admin/vendorAssignmentPolicy";
import { emitEvent } from "@/lib/emitEvent";

/** POST: reassign job vendor. Updates job.assigned_vendor_id and only future (non-completed) schedules. Admin only. */
export async function POST(
    request: NextRequest,
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

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    let body: { vendor_id?: string | null; apply_to_future_schedules?: boolean } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const vendorId =
        body.vendor_id === null || body.vendor_id === undefined
            ? null
            : typeof body.vendor_id === "string"
              ? body.vendor_id.trim() || null
              : null;
    const applyToFutureSchedules = body.apply_to_future_schedules === true;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (supabaseUrl) console.log("SUPABASE_URL_HOST", new URL(supabaseUrl).host);

    const supabase = createAdminClient();

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, org_id, assigned_vendor_id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (vendorId) {
        const { data: vendor, error: vErr } = await supabase
            .from("vendors")
            .select("id, status_key")
            .eq("id", vendorId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
        if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
        if (!vendorIsEligibleForAssignment(vendor as { id: string; status_key?: string | null })) {
            return NextResponse.json({ error: "Vendor is not eligible for assignment" }, { status: 400 });
        }
    }

    const { error: jobUpdateErr } = await supabase
        .from("jobs")
        .update({ assigned_vendor_id: vendorId })
        .eq("id", jobId)
        .eq("org_id", ctx.orgId);

    if (jobUpdateErr) return NextResponse.json({ error: jobUpdateErr.message }, { status: 500 });

    const oldVendorId = (job as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? null;
    let updatedSchedulesCount = 0;
    if (applyToFutureSchedules) {
        const { data: orgRow } = await supabase
            .from("org_settings")
            .select("metadata")
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const meta = (orgRow as OrgSettingsRow | null)?.metadata as { vendor_payout_policy?: { completed_status_key?: string } } | undefined;
        const completedStatusKey = meta?.vendor_payout_policy?.completed_status_key ?? "completed";

        const { data: updated, error: schedErr } = await supabase
            .from("schedules")
            .update({ assigned_vendor_id: vendorId })
            .eq("org_id", ctx.orgId)
            .eq("job_id", jobId)
            .or(`status_key.is.null,status_key.neq.${completedStatusKey}`)
            .select("id");

        if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });
        updatedSchedulesCount = (updated ?? []).length;
    }

    try {
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "job_vendor_reassigned",
            entity_type: "jobs",
            entity_id: jobId,
            payload: {
                old_assigned_vendor_id: oldVendorId,
                new_assigned_vendor_id: vendorId,
                apply_to_future_schedules: applyToFutureSchedules,
                updated_schedules_count: updatedSchedulesCount,
                actor_user_id: ctx.userId,
            },
        });
    } catch (e) {
        console.warn("[assign-vendor] emitEvent", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({
        job_id: jobId,
        assigned_vendor_id: vendorId,
        updated_schedules_count: updatedSchedulesCount,
    });
}
