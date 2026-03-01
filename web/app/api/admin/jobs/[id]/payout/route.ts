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
    assigned_vendor_id?: string | null;
};

/** GET: payout policy + per-schedule payout for a job. Per-schedule payout uses schedule.assigned_vendor_id (history-safe). */
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

    const jobAssignedVendorId = (job as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? null;

    const { data: orgSettingsRow, error: orgErr } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    const { data: scheduleRows, error: schedErr } = await supabase
        .from("schedules")
        .select("id, status_key, start_at, created_at, assigned_vendor_id")
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

    const vendorIds = [...new Set(ordered.map((r) => r.assigned_vendor_id).filter(Boolean))] as string[];
    const vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
            .from("vendors")
            .select("id, org_id, payout_override_type, payout_override_value, metadata")
            .eq("org_id", ctx.orgId)
            .in("id", vendorIds);
        (vendors ?? []).forEach((v) => vendorMap.set((v as { id: string }).id, v as VendorRow));
    }

    const basisJob = "job_completed_occurrences";
    const basisVendorJob = "vendor_job_completed_occurrences";

    let jobOccurrenceCounter = 0;
    const vendorOccurrenceCounters = new Map<string, number>();

    const schedules = ordered.map((row) => {
        const scheduleVendorId = row.assigned_vendor_id ?? null;
        const vendor = scheduleVendorId ? vendorMap.get(scheduleVendorId) ?? null : null;
        const { policy } = resolveVendorPayoutPolicy({ orgSettings, vendor });
        const completedStatusKey = policy.completed_status_key ?? "completed";
        const isCompleted = (row.status_key ?? "") === completedStatusKey;

        const basis =
            policy.basis === basisVendorJob ? basisVendorJob : basisJob;
        const useTiered =
            policy.mode === "tiered" &&
            (basis === basisJob || basis === basisVendorJob) &&
            completedStatusKey;

        let occurrenceNumber: number | null = null;
        if (useTiered && isCompleted) {
            if (basis === basisJob) {
                occurrenceNumber = ++jobOccurrenceCounter;
            } else {
                if (scheduleVendorId) {
                    const next = (vendorOccurrenceCounters.get(scheduleVendorId) ?? 0) + 1;
                    vendorOccurrenceCounters.set(scheduleVendorId, next);
                    occurrenceNumber = next;
                }
            }
        }

        const payoutPercent =
            occurrenceNumber != null
                ? computePayoutPercent({ policy, completedOccurrences: occurrenceNumber })
                : null;

        return {
            schedule_id: row.id,
            assigned_vendor_id: scheduleVendorId,
            status_key: row.status_key ?? null,
            scheduled_at: row.start_at ?? null,
            completed_at: null as string | null,
            occurrence_number: occurrenceNumber,
            payout_percent: payoutPercent,
        };
    });

    const jobVendor = jobAssignedVendorId ? vendorMap.get(jobAssignedVendorId) ?? null : null;
    const { policy: jobPolicy, source } = resolveVendorPayoutPolicy({
        orgSettings,
        vendor: jobVendor,
    });
    const jobCompletedStatusKey = jobPolicy.completed_status_key ?? "completed";
    const jobBasis =
        jobPolicy.basis === basisVendorJob ? basisVendorJob : basisJob;

    let completedOccurrencesForCurrentVendor = 0;
    if (jobPolicy.mode === "tiered" && jobAssignedVendorId) {
        if (jobBasis === basisJob) {
            completedOccurrencesForCurrentVendor = ordered.filter(
                (r) => (r.status_key ?? "") === jobCompletedStatusKey
            ).length;
        } else {
            completedOccurrencesForCurrentVendor = ordered.filter(
                (r) =>
                    (r.status_key ?? "") === jobCompletedStatusKey &&
                    (r.assigned_vendor_id ?? null) === jobAssignedVendorId
            ).length;
        }
    }

    const currentPayoutPercent = computePayoutPercent({
        policy: jobPolicy,
        completedOccurrences: completedOccurrencesForCurrentVendor,
    });

    return NextResponse.json({
        policy: {
            mode: jobPolicy.mode,
            type: jobPolicy.type,
            basis: jobPolicy.basis ?? null,
            completed_status_key: jobPolicy.completed_status_key ?? null,
            value: jobPolicy.value ?? null,
            tiers: jobPolicy.tiers ?? null,
        },
        source,
        job: {
            id: (job as { id: string }).id,
            assigned_vendor_id: jobAssignedVendorId,
            completed_occurrences_total: completedOccurrencesForCurrentVendor,
            current_payout_percent: currentPayoutPercent,
        },
        schedules,
    });
}
