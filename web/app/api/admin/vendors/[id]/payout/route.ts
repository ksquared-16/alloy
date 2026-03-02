import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    resolveVendorPayoutPolicy,
    computePayoutPercent,
    type OrgSettingsRow,
    type VendorRow,
} from "@/lib/admin/vendorPayoutPolicy";

/** GET: effective payout policy and percent for a vendor and optional job. Admin/ops can read. */
export async function GET(
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

    const { id: vendorId } = await context.params;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor id" }, { status: 400 });

    const jobId = request.nextUrl.searchParams.get("job_id")?.trim() || null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (supabaseUrl) console.log("SUPABASE_URL_HOST", new URL(supabaseUrl).host);

    const supabase = createAdminClient();

    const { data: vendor, error: vendorErr } = await supabase
        .from("vendors")
        .select("id, org_id, payout_override_type, payout_override_value, metadata")
        .eq("id", vendorId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (vendorErr) return NextResponse.json({ error: vendorErr.message }, { status: 500 });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const { data: orgSettingsRow, error: orgErr } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    const { policy, source } = resolveVendorPayoutPolicy({
        orgSettings,
        vendor: vendor as VendorRow,
    });

    const completedStatusKey = policy.completed_status_key ?? "completed";
    const completedStatusKeyNorm = String(completedStatusKey ?? "completed").trim().toLowerCase();
    let completedOccurrences = 0;
    if (jobId && ctx.orgId && policy.mode === "tiered") {
        const basis = policy.basis === "vendor_job_completed_occurrences" ? "vendor_job_completed_occurrences" : "job_completed_occurrences";
        const { data: scheduleRows, error: schedErr } = await supabase
            .from("schedules")
            .select("id, status_key, assigned_vendor_id")
            .eq("org_id", ctx.orgId)
            .eq("job_id", jobId);
        if (!schedErr && scheduleRows?.length) {
            const completed = (scheduleRows as { id: string; status_key?: string | null; assigned_vendor_id?: string | null }[]).filter((r) => {
                const rowStatusNorm = String(r.status_key ?? "").trim().toLowerCase();
                if (rowStatusNorm !== completedStatusKeyNorm) return false;
                if (basis === "vendor_job_completed_occurrences") return (r.assigned_vendor_id ?? null) === vendorId;
                return true;
            });
            completedOccurrences = completed.length;
        }
    }

    const payout_percent = computePayoutPercent({ policy, completedOccurrences });

    return NextResponse.json({
        policy: {
            mode: policy.mode,
            type: policy.type,
            basis: policy.basis ?? null,
            value: policy.value,
            completed_status_key: policy.completed_status_key ?? null,
            tiers: policy.tiers ?? null,
        },
        source,
        completed_occurrences: completedOccurrences,
        payout_percent,
        completed_status_key_used: completedStatusKeyNorm,
    });
}
