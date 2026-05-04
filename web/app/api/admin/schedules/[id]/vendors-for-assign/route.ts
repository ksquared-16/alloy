import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { withVendorSelectLabels } from "@/lib/admin/withVendorSelectLabels";
import { DEFAULT_VENDOR_ASSIGNMENT_POLICY } from "@/lib/admin/vendorAssignmentPolicy";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertScheduleInAccessScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";

/** GET: vendors that can be assigned to this schedule (org + job vertical + status_key = active per assignment policy). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedule, error: sErr } = await supabase
        .from("schedules")
        .select("job_id, org_id, location_id")
        .eq("id", scheduleId)
        .eq("org_id", ctx.orgId)
        .single();
    if (sErr || !schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    const sch = schedule as { job_id?: string | null; location_id?: string | null; org_id?: string };
    if (!(await assertScheduleInAccessScope(supabase, ctx.orgId, dim, { job_id: sch.job_id ?? null, location_id: sch.location_id ?? null }))) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const jobId = (schedule as { job_id?: string }).job_id;
    const orgId = (schedule as { org_id?: string }).org_id;
    if (!jobId) return NextResponse.json({ vendors: [] });
    if (!orgId) return NextResponse.json({ vendors: [] });

    const { data: job } = await supabase.from("jobs").select("vertical_id").eq("id", jobId).eq("org_id", orgId).single();
    const verticalId = (job as { vertical_id?: string } | null)?.vertical_id ?? null;
    if (!verticalId) return NextResponse.json({ vendors: [] });

    const { data: vvRows } = await supabase.from("vendor_verticals").select("vendor_id").eq("vertical_id", verticalId);
    const vendorIds = ((vvRows ?? []) as { vendor_id: string }[]).map((r) => r.vendor_id);
    if (vendorIds.length === 0) return NextResponse.json({ vendors: [] });

    const { data: vendorRows } = await supabase
        .from("vendors")
        .select("id, name, company_name, email, phone, primary_person_id")
        .eq("org_id", orgId)
        .in("id", vendorIds)
        .eq("status_key", DEFAULT_VENDOR_ASSIGNMENT_POLICY.vendorStatusKey)
        .order("name");
    const vendors = await withVendorSelectLabels(supabase, vendorRows ?? []);
    return NextResponse.json({ vendors });
}
