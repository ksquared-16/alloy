/**
 * GL posting when a schedule is marked completed.
 * Creates one gl_journal_entry + 5 gl_journal_lines (balanced: cash/AR, revenue, discount, payout expense, vendor payable).
 * Idempotent: upsert entry by (org_id, source_type, source_id); replace lines.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveVendorPayoutPolicy,
    computePayoutPercent,
    type OrgSettingsRow,
    type VendorRow,
} from "@/lib/admin/vendorPayoutPolicy";
import { normalizeJobDiscountAmountToCents } from "@/lib/admin/jobDisplayPrice";

const SOURCE_TYPE = "schedule_completed";
const REQUIRED_MAPPING_KEYS = [
    "revenue_service",
    "contra_discounts",
    "expense_vendor_payouts",
    "asset_cash_clearing",
    "liability_vendor_payable",
] as const;
const basisJob = "job_completed_occurrences";
const basisVendorJob = "vendor_job_completed_occurrences";

type ScheduleRow = {
    id: string;
    org_id: string;
    job_id: string | null;
    status_key: string | null;
    assigned_vendor_id: string | null;
    price_cents: number | null;
    start_at: string | null;
    created_at?: string | null;
};

type JobRow = {
    id: string;
    org_id: string;
    gross_price_cents: number | null;
    discount_amount: number | string | null;
    customer_id: string | null;
    assigned_vendor_id: string | null;
};

export type PostScheduleCompletionResult = {
    entry_id: string;
    schedule_id: string;
    gross_cents: number;
    discount_cents: number;
    net_cents: number;
    payout_percent: number;
    payout_cents: number;
    mapping_keys_used: string[];
};

export type PostScheduleCompletionError =
    | { code: "schedule_not_found" }
    | { code: "schedule_not_completed"; status_key: string | null }
    | { code: "job_not_found" }
    | { code: "missing_mappings"; keys: string[] }
    | { code: "entry_unbalanced"; total_debits: number; total_credits: number };

/**
 * Compute occurrence number for this schedule among completed schedules for the job (ordered by start_at, created_at).
 * Uses policy.basis: job_completed_occurrences or vendor_job_completed_occurrences.
 */
function computeOccurrenceNumber(params: {
    orderedSchedules: ScheduleRow[];
    scheduleId: string;
    completedStatusKeyNorm: string;
    basis: string;
    assignedVendorId: string | null;
}): number {
    const { orderedSchedules, scheduleId, completedStatusKeyNorm, basis, assignedVendorId } = params;
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

/**
 * Post GL entry for a completed schedule. Idempotent.
 * Call after validating schedule.status_key is completed (case-insensitive).
 */
export async function postScheduleCompletion(params: {
    supabase: SupabaseClient;
    orgId: string;
    scheduleId: string;
}): Promise<PostScheduleCompletionResult | PostScheduleCompletionError> {
    const { supabase, orgId, scheduleId } = params;

    const { data: schedule, error: sErr } = await supabase
        .from("schedules")
        .select("id, org_id, job_id, status_key, assigned_vendor_id, price_cents, start_at, created_at")
        .eq("id", scheduleId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (sErr) return { code: "schedule_not_found" };
    if (!schedule) return { code: "schedule_not_found" };

    const s = schedule as ScheduleRow;
    const statusNorm = String(s.status_key ?? "").trim().toLowerCase();
    const completedNorm = "completed";
    if (statusNorm !== completedNorm) {
        return { code: "schedule_not_completed", status_key: s.status_key };
    }

    const jobId = s.job_id;
    if (!jobId) return { code: "job_not_found" };

    const { data: job, error: jErr } = await supabase
        .from("jobs")
        .select("id, org_id, gross_price_cents, discount_amount, customer_id, assigned_vendor_id")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (jErr || !job) return { code: "job_not_found" };
    const j = job as JobRow;

    const grossCents = Math.max(0, Math.round(Number(s.price_cents ?? j.gross_price_cents ?? 0)));
    const jobGross = Math.max(0, Math.round(Number(j.gross_price_cents ?? 0)));
    const basisForDiscount = jobGross > 0 ? jobGross : grossCents;
    const discountCents = Math.min(normalizeJobDiscountAmountToCents(j.discount_amount, basisForDiscount), grossCents);
    const effectiveDiscountCents = s.price_cents == null ? discountCents : 0;
    const netCents = Math.max(0, grossCents - effectiveDiscountCents);

    const { data: orgSettingsRow } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    let vendor: VendorRow | null = null;
    const scheduleVendorId = s.assigned_vendor_id ?? null;
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

    const occurrenceNumber = computeOccurrenceNumber({
        orderedSchedules: orderedSorted,
        scheduleId,
        completedStatusKeyNorm,
        basis,
        assignedVendorId: scheduleVendorId,
    });

    const payoutPercent = occurrenceNumber > 0
        ? computePayoutPercent({ policy, completedOccurrences: occurrenceNumber })
        : (typeof policy.value === "number" ? Math.max(0, Math.min(100, policy.value)) : 80);
    const payoutCents = Math.round((netCents * payoutPercent) / 100);

    const { data: mappingsRows } = await supabase
        .from("gl_account_mappings")
        .select("key, gl_account_id")
        .eq("org_id", orgId)
        .in("key", [...REQUIRED_MAPPING_KEYS]);

    const mappingByKey = new Map<string, string>();
    (mappingsRows ?? []).forEach((r: { key: string; gl_account_id: string }) => {
        mappingByKey.set(r.key, r.gl_account_id);
    });

    const missing = REQUIRED_MAPPING_KEYS.filter((k) => !mappingByKey.get(k));
    if (missing.length > 0) {
        return { code: "missing_mappings", keys: missing };
    }

    const totalDebits = netCents + effectiveDiscountCents + payoutCents;
    const totalCredits = grossCents + payoutCents;
    if (totalDebits !== totalCredits) {
        return {
            code: "entry_unbalanced",
            total_debits: totalDebits,
            total_credits: totalCredits,
        };
    }

    const entryDate = s.start_at
        ? new Date(s.start_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
    const description = `Schedule completed: ${scheduleId}`;

    const { data: existingEntry } = await supabase
        .from("gl_journal_entries")
        .select("id")
        .eq("org_id", orgId)
        .eq("source_type", SOURCE_TYPE)
        .eq("source_id", scheduleId)
        .maybeSingle();

    let entryId: string;
    if (existingEntry && (existingEntry as { id: string }).id) {
        entryId = (existingEntry as { id: string }).id;
        await supabase
            .from("gl_journal_entries")
            .update({
                description,
                status: "posted",
                entry_date: entryDate,
            })
            .eq("id", entryId)
            .eq("org_id", orgId);
    } else {
        const { data: inserted, error: insErr } = await supabase
            .from("gl_journal_entries")
            .insert({
                org_id: orgId,
                source_type: SOURCE_TYPE,
                source_id: scheduleId,
                description,
                status: "posted",
                entry_date: entryDate,
            })
            .select("id")
            .single();
        if (insErr) {
            if (String(insErr.code ?? "").toLowerCase() === "23505") {
                const { data: again } = await supabase
                    .from("gl_journal_entries")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("source_type", SOURCE_TYPE)
                    .eq("source_id", scheduleId)
                    .maybeSingle();
                const found = (again as { id: string } | null)?.id;
                if (!found) throw new Error("GL entry conflict but row not found");
                entryId = found;
            } else {
                throw insErr;
            }
        } else {
            entryId = (inserted as { id: string }).id;
        }
    }

    await supabase
        .from("gl_journal_lines")
        .delete()
        .eq("org_id", orgId)
        .eq("entry_id", entryId);

    const customerId = (j.customer_id ?? null) as string | null;
    const vendorId = scheduleVendorId ?? (j.assigned_vendor_id ?? null) ?? null;

    type LineRow = { entry_id: string; org_id: string; job_id: string | null; schedule_id: string; customer_id: string | null; vendor_id: string | null; line_no: number; account_id: string; debit_cents: number; credit_cents: number; description?: string };
    const stamp = { entry_id: entryId, org_id: orgId, job_id: jobId, schedule_id: scheduleId, customer_id: customerId, vendor_id: vendorId };

    const lines: LineRow[] = [];

    // Line 1: DR asset_cash_clearing = net_cents
    lines.push({
        ...stamp,
        line_no: 1,
        account_id: mappingByKey.get("asset_cash_clearing")!,
        debit_cents: netCents,
        credit_cents: 0,
        description: "Cash clearing (net)",
    });

    // Line 2: CR revenue_service = gross_cents
    lines.push({
        ...stamp,
        line_no: 2,
        account_id: mappingByKey.get("revenue_service")!,
        debit_cents: 0,
        credit_cents: grossCents,
        description: "Service revenue",
    });

    // Line 3: DR contra_discounts = effective_discount_cents (skip if 0)
    if (effectiveDiscountCents > 0) {
        lines.push({
            ...stamp,
            line_no: 3,
            account_id: mappingByKey.get("contra_discounts")!,
            debit_cents: effectiveDiscountCents,
            credit_cents: 0,
            description: "Discount (contra-revenue)",
        });
    }

    // Line 4: DR expense_vendor_payouts = payout_cents
    lines.push({
        ...stamp,
        line_no: lines.length + 1,
        account_id: mappingByKey.get("expense_vendor_payouts")!,
        debit_cents: payoutCents,
        credit_cents: 0,
        description: "Vendor payout expense",
    });

    // Line 5: CR liability_vendor_payable = payout_cents
    lines.push({
        ...stamp,
        line_no: lines.length + 1,
        account_id: mappingByKey.get("liability_vendor_payable")!,
        debit_cents: 0,
        credit_cents: payoutCents,
        description: "Vendor payable",
    });

    const linesWithNo = lines.map((l, i) => ({ ...l, line_no: i + 1 }));
    const { error: linesErr } = await supabase.from("gl_journal_lines").insert(linesWithNo);
    if (linesErr) throw linesErr;

    return {
        entry_id: entryId,
        schedule_id: scheduleId,
        gross_cents: grossCents,
        discount_cents: effectiveDiscountCents,
        net_cents: netCents,
        payout_percent: payoutPercent,
        payout_cents: payoutCents,
        mapping_keys_used: [...REQUIRED_MAPPING_KEYS],
    };
}
