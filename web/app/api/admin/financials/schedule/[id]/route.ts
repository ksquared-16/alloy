import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    resolveVendorPayoutPolicy,
    computePayoutPercent,
    type OrgSettingsRow,
    type VendorRow,
} from "@/lib/admin/vendorPayoutPolicy";

export const dynamic = "force-dynamic";

const basisJob = "job_completed_occurrences";
const basisVendorJob = "vendor_job_completed_occurrences";

type ScheduleRow = { id: string; job_id: string | null; status_key: string | null; start_at: string | null; assigned_vendor_id: string | null; price_cents: number | null; created_at?: string | null };

function computeOccurrenceNumber(
    orderedSchedules: ScheduleRow[],
    scheduleId: string,
    completedStatusKeyNorm: string,
    basis: string,
    assignedVendorId: string | null
): number {
    let n = 0;
    for (const row of orderedSchedules) {
        const rowStatusNorm = String(row.status_key ?? "").trim().toLowerCase();
        if (rowStatusNorm !== completedStatusKeyNorm) continue;
        if (basis === basisVendorJob && (row.assigned_vendor_id ?? null) !== assignedVendorId) continue;
        n++;
        if (row.id === scheduleId) return n;
    }
    return 0;
}

/** GET /api/admin/financials/schedule/[id] — schedule + job + journal entry (if posted) + computed summary. Admin/ops. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id: scheduleId } = await context.params;
    if (!scheduleId) return NextResponse.json({ error: "Missing schedule id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: schedule, error: sErr } = await supabase
        .from("schedules")
        .select("id, job_id, status_key, start_at, assigned_vendor_id, price_cents, created_at")
        .eq("id", scheduleId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (sErr || !schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    const s = schedule as ScheduleRow & { created_at?: string | null };

    const jobId = s.job_id;
    if (!jobId) {
        return NextResponse.json({
            schedule: { id: s.id, job_id: s.job_id, status_key: s.status_key, start_at: s.start_at, assigned_vendor_id: s.assigned_vendor_id, price_cents: s.price_cents },
            job: null,
            journal_entry: null,
            computed: { gross_cents: 0, discount_cents: 0, net_cents: 0, payout_percent: 0, payout_cents: 0, alloy_fee_cents: 0 },
        });
    }

    const { data: job, error: jErr } = await supabase
        .from("jobs")
        .select("id, customer_id, assigned_vendor_id, gross_price_cents, discount_code, discount_amount")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (jErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const j = job as { id: string; customer_id: string | null; assigned_vendor_id: string | null; gross_price_cents: number | null; discount_code: string | null; discount_amount: number | string | null };

    const grossCents = Math.max(0, Math.round(Number(s.price_cents ?? j.gross_price_cents ?? 0)));
    const jobDiscountRaw = Math.max(0, Math.round(Number(j.discount_amount ?? 0)));
    const discountCents = Math.min(jobDiscountRaw, grossCents);
    const effectiveDiscountCents = s.price_cents == null ? discountCents : 0;
    const netCents = Math.max(0, grossCents - effectiveDiscountCents);

    const { data: orgSettingsRow } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    const scheduleVendorId = s.assigned_vendor_id ?? null;
    let vendor: VendorRow | null = null;
    if (scheduleVendorId) {
        const { data: vendorRow } = await supabase
            .from("vendors")
            .select("id, org_id, payout_override_type, payout_override_value, metadata")
            .eq("id", scheduleVendorId)
            .eq("org_id", orgId)
            .maybeSingle();
        vendor = vendorRow as VendorRow | null;
    }

    const { policy } = resolveVendorPayoutPolicy({ orgSettings, vendor });
    const completedStatusKey = policy.completed_status_key ?? "completed";
    const completedStatusKeyNorm = String(completedStatusKey).trim().toLowerCase();
    const basis = policy.basis === basisVendorJob ? basisVendorJob : basisJob;

    const { data: jobSchedulesRows } = await supabase
        .from("schedules")
        .select("id, status_key, assigned_vendor_id, start_at, created_at")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .order("start_at", { ascending: true, nullsFirst: false });

    const ordered = (jobSchedulesRows ?? []) as ScheduleRow[];
    const orderedSorted = [...ordered].sort((a, b) => {
        const ta = a.start_at ?? a.created_at ?? "";
        const tb = b.start_at ?? b.created_at ?? "";
        return ta.localeCompare(tb);
    });

    const occurrenceNumber = computeOccurrenceNumber(orderedSorted, scheduleId, completedStatusKeyNorm, basis, scheduleVendorId);
    const payoutPercent = occurrenceNumber > 0
        ? computePayoutPercent({ policy, completedOccurrences: occurrenceNumber })
        : (typeof policy.value === "number" ? Math.max(0, Math.min(100, policy.value)) : 80);
    const payoutCents = Math.round((netCents * payoutPercent) / 100);
    const alloyFeeCents = netCents - payoutCents;

    const { data: entryRow } = await supabase
        .from("gl_journal_entries")
        .select("id, status, entry_date, description, created_at")
        .eq("org_id", orgId)
        .eq("source_type", "schedule_completed")
        .eq("source_id", scheduleId)
        .maybeSingle();

    let journal_entry: { id: string; status: string | null; entry_date: string | null; description: string | null; created_at: string | null; lines: { line_no: number; account_id: string; account_code: string | null; account_name: string | null; debit_cents: number; credit_cents: number }[] } | null = null;

    if (entryRow) {
        const entryId = (entryRow as { id: string }).id;
        const { data: lineRows } = await supabase
            .from("gl_journal_lines")
            .select("line_no, account_id, debit_cents, credit_cents")
            .eq("entry_id", entryId)
            .eq("org_id", orgId)
            .order("line_no", { ascending: true });

        const lineList = (lineRows ?? []) as { line_no: number; account_id: string; debit_cents: number; credit_cents: number }[];
        const accountIds = [...new Set(lineList.map((l) => l.account_id))];
        const { data: accounts } = accountIds.length
            ? await supabase.from("gl_accounts").select("id, code, name").in("id", accountIds)
            : { data: [] };
        const accountMap = new Map((accounts ?? []).map((a) => [(a as { id: string }).id, a as { code: string | null; name: string | null }]));

        journal_entry = {
            id: (entryRow as { id: string }).id,
            status: (entryRow as { status?: string | null }).status ?? null,
            entry_date: (entryRow as { entry_date?: string | null }).entry_date ?? null,
            description: (entryRow as { description?: string | null }).description ?? null,
            created_at: (entryRow as { created_at?: string | null }).created_at ?? null,
            lines: lineList.map((l) => {
                const acc = accountMap.get(l.account_id);
                return {
                    line_no: l.line_no,
                    account_id: l.account_id,
                    account_code: (acc as { code?: string | null } | undefined)?.code ?? null,
                    account_name: (acc as { name?: string | null } | undefined)?.name ?? null,
                    debit_cents: Number(l.debit_cents) || 0,
                    credit_cents: Number(l.credit_cents) || 0,
                };
            }),
        };
    }

    return NextResponse.json({
        schedule: { id: s.id, job_id: s.job_id, status_key: s.status_key, start_at: s.start_at, assigned_vendor_id: s.assigned_vendor_id, price_cents: s.price_cents },
        job: { id: j.id, customer_id: j.customer_id, gross_price_cents: j.gross_price_cents, discount_code: j.discount_code, discount_amount: j.discount_amount },
        journal_entry,
        computed: {
            gross_cents: grossCents,
            discount_cents: effectiveDiscountCents,
            net_cents: netCents,
            payout_percent: payoutPercent,
            payout_cents: payoutCents,
            alloy_fee_cents: alloyFeeCents,
        },
    });
}
