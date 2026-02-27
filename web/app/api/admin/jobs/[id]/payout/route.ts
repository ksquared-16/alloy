import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    resolveVendorPayoutPolicy,
    computePayoutPercent,
    type OrgSettingsRow,
    type VendorRow,
} from "@/lib/admin/vendorPayoutPolicy";

type ScheduleRow = {
    id: string;
    status_key: string | null;
    start_at: string | null;
    created_at?: string | null;
};

/** GET: payout policy + per-schedule payout for a job. Admin/ops read. */
export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, org_id, assigned_vendor_id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const assignedVendorId = (job as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? null;

    const { data: orgSettingsRow, error: orgErr } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    let policy: ReturnType<typeof resolveVendorPayoutPolicy>["policy"];
    let source: ReturnType<typeof resolveVendorPayoutPolicy>["source"];

    if (assignedVendorId) {
        const { data: vendor, error: vendorErr } = await supabase
            .from("vendors")
            .select("id, org_id, payout_override_type, payout_override_value, metadata")
            .eq("id", assignedVendorId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();

        if (vendorErr) return NextResponse.json({ error: vendorErr.message }, { status: 500 });
        const resolved = resolveVendorPayoutPolicy({
            orgSettings,
            vendor: (vendor ?? null) as VendorRow | null,
        });
        policy = resolved.policy;
        source = resolved.source;
    } else {
        const resolved = resolveVendorPayoutPolicy({
            orgSettings,
            vendor: null,
        });
        policy = resolved.policy;
        source = resolved.source;
    }

    const completedStatusKey = policy.completed_status_key ?? "completed";
    const useTieredBasis =
        (policy.basis === "job_completed_occurrences" || (!policy.basis && policy.mode === "tiered")) &&
        completedStatusKey;

    const { data: scheduleRows, error: schedErr } = await supabase
        .from("schedules")
        .select("id, status_key, start_at, created_at")
        .eq("org_id", ctx.orgId)
        .eq("job_id", jobId)
        .order("start_at", { ascending: true, nullsFirst: false });

    if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });

    const rows = (scheduleRows ?? []) as ScheduleRow[];
    const ordered = [...rows].sort((a, b) => {
        const ta = a.start_at ?? a.created_at ?? "";
        const tb = b.start_at ?? b.created_at ?? "";
        return ta.localeCompare(tb);
    });

    let occurrenceCounter = 0;
    const schedules = ordered.map((row) => {
        const isCompleted = (row.status_key ?? "") === completedStatusKey;
        const occurrenceNumber = useTieredBasis && isCompleted ? ++occurrenceCounter : null;
        const payoutPercent =
            occurrenceNumber != null
                ? computePayoutPercent({ policy, completedOccurrences: occurrenceNumber })
                : null;

        return {
            schedule_id: row.id,
            status_key: row.status_key ?? null,
            scheduled_at: row.start_at ?? null,
            completed_at: null as string | null,
            occurrence_number: occurrenceNumber,
            payout_percent: payoutPercent,
        };
    });

    const completedOccurrencesTotal = occurrenceCounter;
    const currentPayoutPercent = computePayoutPercent({
        policy,
        completedOccurrences: completedOccurrencesTotal,
    });

    return NextResponse.json({
        policy: {
            mode: policy.mode,
            type: policy.type,
            basis: policy.basis ?? null,
            completed_status_key: policy.completed_status_key ?? null,
            value: policy.value ?? null,
            tiers: policy.tiers ?? null,
        },
        source,
        job: {
            id: (job as { id: string }).id,
            assigned_vendor_id: assignedVendorId,
            completed_occurrences_total: completedOccurrencesTotal,
            current_payout_percent: currentPayoutPercent,
        },
        schedules,
    });
}
