import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import type { OrgSettingsRow } from "@/lib/admin/vendorPayoutPolicy";
import { resolveVendorAssignmentStatusId } from "@/lib/admin/vendorAssignmentPolicy";

/** POST: reassign job vendor. Updates job.assigned_vendor_id and only future (non-completed) schedules. Admin only. */
export async function POST(
    request: NextRequest,
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
        .select("id, org_id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (vendorId) {
        const requiredStatusId = await resolveVendorAssignmentStatusId(supabase);
        if (!requiredStatusId) {
            return NextResponse.json({ error: "Assignment policy status is not configured" }, { status: 400 });
        }
        const { data: vendor, error: vErr } = await supabase
            .from("vendors")
            .select("id, vendor_status_id")
            .eq("id", vendorId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
        if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
        if ((vendor as { vendor_status_id?: string | null }).vendor_status_id !== requiredStatusId) {
            return NextResponse.json({ error: "Vendor is not eligible for assignment" }, { status: 400 });
        }
    }

    const { error: jobUpdateErr } = await supabase
        .from("jobs")
        .update({ assigned_vendor_id: vendorId })
        .eq("id", jobId)
        .eq("org_id", ctx.orgId);

    if (jobUpdateErr) return NextResponse.json({ error: jobUpdateErr.message }, { status: 500 });

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

    return NextResponse.json({
        job_id: jobId,
        assigned_vendor_id: vendorId,
        updated_schedules_count: updatedSchedulesCount,
    });
}
