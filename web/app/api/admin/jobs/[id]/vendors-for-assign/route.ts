import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { withVendorSelectLabels } from "@/lib/admin/withVendorSelectLabels";
import { DEFAULT_VENDOR_ASSIGNMENT_POLICY } from "@/lib/admin/vendorAssignmentPolicy";

/** GET: vendors that can be assigned to this job (org + job vertical + status_key = active per assignment policy). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job, error: jErr } = await supabase
        .from("jobs")
        .select("id, vertical_id, org_id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .single();
    if (jErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const orgId = (job as { org_id?: string | null }).org_id;
    const verticalId = (job as { vertical_id?: string } | null)?.vertical_id ?? null;
    if (!orgId) return NextResponse.json({ vendors: [] });
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
