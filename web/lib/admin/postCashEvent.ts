/**
 * Cash-event posting: customer payments (cash receipt) and vendor payouts (cash out).
 * Creates ledger_transactions + gl_journal_entries (balanced). Idempotent by provider_ref and (source_type, source_id).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveVendorPayoutPolicy,
    computePayoutPercent,
    type OrgSettingsRow,
    type VendorRow,
} from "@/lib/admin/vendorPayoutPolicy";

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

export type PostCashEventResult = {
    entry_id: string;
    ledger_transaction_id: string;
    schedule_id: string;
    amount_cents: number;
    mapping_keys_used: string[];
};

export type PostCashEventError =
    | { code: "schedule_not_found" }
    | { code: "schedule_not_completed"; status_key: string | null }
    | { code: "job_not_found" }
    | { code: "missing_mappings"; keys: string[] };

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

function loadScheduleAndJob(
    supabase: SupabaseClient,
    orgId: string,
    scheduleId: string
): Promise<
    | { schedule: ScheduleRow; job: JobRow }
    | { code: "schedule_not_found" }
    | { code: "schedule_not_completed"; status_key: string | null }
    | { code: "job_not_found" }
> {
    return (async () => {
        const { data: schedule, error: sErr } = await supabase
            .from("schedules")
            .select("id, org_id, job_id, status_key, assigned_vendor_id, price_cents, start_at, created_at")
            .eq("id", scheduleId)
            .eq("org_id", orgId)
            .maybeSingle();

        if (sErr || !schedule) return { code: "schedule_not_found" };
        const s = schedule as ScheduleRow;

        const statusNorm = String(s.status_key ?? "").trim().toLowerCase();
        if (statusNorm !== "completed") {
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
        return { schedule: s, job: job as JobRow };
    })();
}

/** Same gross/net/discount as postScheduleCompletion. */
function computeCustomerPaymentAmounts(schedule: ScheduleRow, job: JobRow): { gross_cents: number; discount_cents: number; net_cents: number } {
    const grossCents = Math.max(0, Math.round(Number(schedule.price_cents ?? job.gross_price_cents ?? 0)));
    const jobDiscountRaw = Math.max(0, Math.round(Number(job.discount_amount ?? 0)));
    const discountCents = Math.min(jobDiscountRaw, grossCents);
    const effectiveDiscountCents = schedule.price_cents == null ? discountCents : 0;
    const netCents = Math.max(0, grossCents - effectiveDiscountCents);
    return { gross_cents: grossCents, discount_cents: effectiveDiscountCents, net_cents: netCents };
}

/** Same payout policy as postScheduleCompletion. */
async function computeVendorPayoutCents(
    supabase: SupabaseClient,
    orgId: string,
    schedule: ScheduleRow,
    job: JobRow
): Promise<number> {
    const { gross_cents: _g, net_cents: netCents } = computeCustomerPaymentAmounts(schedule, job);

    const { data: orgSettingsRow } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    const orgSettings: OrgSettingsRow | null = orgSettingsRow as OrgSettingsRow | null;

    let vendor: VendorRow | null = null;
    const scheduleVendorId = schedule.assigned_vendor_id ?? null;
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
        .eq("job_id", job.id)
        .order("start_at", { ascending: true, nullsFirst: false });

    const ordered = (jobSchedulesRows ?? []) as ScheduleRow[];
    const orderedSorted = [...ordered].sort((a, b) => {
        const ta = a.start_at ?? a.created_at ?? "";
        const tb = b.start_at ?? b.created_at ?? "";
        return ta.localeCompare(tb);
    });

    const occurrenceNumber = computeOccurrenceNumber({
        orderedSchedules: orderedSorted,
        scheduleId: schedule.id,
        completedStatusKeyNorm,
        basis,
        assignedVendorId: scheduleVendorId,
    });

    const payoutPercent =
        occurrenceNumber > 0
            ? computePayoutPercent({ policy, completedOccurrences: occurrenceNumber })
            : typeof policy.value === "number"
              ? Math.max(0, Math.min(100, policy.value))
              : 80;
    return Math.round((netCents * payoutPercent) / 100);
}

/**
 * Post customer payment (cash receipt): Dr asset_cash_operating, Cr asset_cash_clearing.
 * Idempotent by (org_id, provider, provider_ref) for ledger_transactions and (org_id, source_type, source_id) for JE.
 */
export async function postCustomerPaymentForSchedule(params: {
    supabase: SupabaseClient;
    orgId: string;
    scheduleId: string;
    provider?: string;
    providerRef?: string;
}): Promise<PostCashEventResult | PostCashEventError> {
    const { supabase, orgId, scheduleId, provider = "manual", providerRef = `schedule:${scheduleId}:customer_payment` } = params;

    const loaded = await loadScheduleAndJob(supabase, orgId, scheduleId);
    if ("code" in loaded) return loaded;
    const { schedule, job } = loaded;

    const { net_cents: netCents } = computeCustomerPaymentAmounts(schedule, job);

    const REQUIRED_KEYS = ["asset_cash_operating", "asset_cash_clearing"] as const;
    const { data: mappingsRows } = await supabase
        .from("gl_account_mappings")
        .select("key, gl_account_id")
        .eq("org_id", orgId)
        .in("key", [...REQUIRED_KEYS]);

    const mappingByKey = new Map<string, string>();
    (mappingsRows ?? []).forEach((r: { key: string; gl_account_id: string }) => {
        mappingByKey.set(r.key, r.gl_account_id);
    });
    const missing = REQUIRED_KEYS.filter((k) => !mappingByKey.get(k));
    if (missing.length > 0) return { code: "missing_mappings", keys: [...missing] };

    // Idempotent ledger_transaction: select by (org_id, provider, provider_ref)
    const { data: existingLt } = await supabase
        .from("ledger_transactions")
        .select("id, journal_entry_id")
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("provider_ref", providerRef)
        .maybeSingle();

    let ledgerTransactionId: string | undefined;
    let entryId: string;

    if (existingLt && (existingLt as { id: string }).id) {
        const existingEntryId = (existingLt as { journal_entry_id?: string | null }).journal_entry_id;
        if (existingEntryId) {
            return {
                entry_id: existingEntryId,
                ledger_transaction_id: (existingLt as { id: string }).id,
                schedule_id: scheduleId,
                amount_cents: netCents,
                mapping_keys_used: [...REQUIRED_KEYS],
            };
        }
        ledgerTransactionId = (existingLt as { id: string }).id;
    }

    const SOURCE_TYPE = "customer_payment";
    const entryDate = schedule.start_at
        ? new Date(schedule.start_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
    const description = `Customer payment: schedule ${scheduleId}`;

    // Idempotent JE: upsert by (org_id, source_type, source_id)
    const { data: existingEntry } = await supabase
        .from("gl_journal_entries")
        .select("id")
        .eq("org_id", orgId)
        .eq("source_type", SOURCE_TYPE)
        .eq("source_id", scheduleId)
        .maybeSingle();

    if (existingEntry && (existingEntry as { id: string }).id) {
        entryId = (existingEntry as { id: string }).id;
        await supabase
            .from("gl_journal_entries")
            .update({ description, status: "posted", entry_date: entryDate })
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

    await supabase.from("gl_journal_lines").delete().eq("org_id", orgId).eq("entry_id", entryId);

    const customerId = (job.customer_id ?? null) as string | null;
    type LineRow = {
        entry_id: string;
        org_id: string;
        job_id: string | null;
        schedule_id: string;
        customer_id: string | null;
        vendor_id: string | null;
        line_no: number;
        account_id: string;
        debit_cents: number;
        credit_cents: number;
        description?: string;
    };
    const stamp = {
        entry_id: entryId,
        org_id: orgId,
        job_id: job.id,
        schedule_id: scheduleId,
        customer_id: customerId,
        vendor_id: null as string | null,
    };

    const lines: LineRow[] = [
        { ...stamp, line_no: 1, account_id: mappingByKey.get("asset_cash_operating")!, debit_cents: netCents, credit_cents: 0, description: "Cash operating (receipt)" },
        { ...stamp, line_no: 2, account_id: mappingByKey.get("asset_cash_clearing")!, debit_cents: 0, credit_cents: netCents, description: "Cash clearing" },
    ];
    const { error: linesErr } = await supabase.from("gl_journal_lines").insert(lines);
    if (linesErr) throw linesErr;

    const now = new Date().toISOString();
    const ltRow = {
        org_id: orgId,
        occurred_at: now,
        status: "confirmed",
        type: "customer_payment",
        direction: "in",
        amount_cents: netCents,
        currency: "USD",
        provider,
        provider_ref: providerRef,
        job_id: job.id,
        schedule_id: scheduleId,
        customer_id: customerId,
        vendor_id: null as string | null,
        journal_entry_id: entryId,
    };

    if (ledgerTransactionId) {
        await supabase
            .from("ledger_transactions")
            .update({ journal_entry_id: entryId, amount_cents: netCents, occurred_at: now })
            .eq("id", ledgerTransactionId)
            .eq("org_id", orgId);
    } else {
        const { data: insertedLt, error: ltErr } = await supabase
            .from("ledger_transactions")
            .insert(ltRow)
            .select("id")
            .single();
        if (ltErr) {
            if (String(ltErr.code ?? "").toLowerCase() === "23505") {
                const { data: again } = await supabase
                    .from("ledger_transactions")
                    .select("id, journal_entry_id")
                    .eq("org_id", orgId)
                    .eq("provider", provider)
                    .eq("provider_ref", providerRef)
                    .maybeSingle();
                if (again && (again as { id: string }).id) {
                    ledgerTransactionId = (again as { id: string }).id;
                    entryId = (again as { journal_entry_id?: string | null }).journal_entry_id ?? entryId;
                } else {
                    throw ltErr;
                }
            } else {
                throw ltErr;
            }
        } else {
            ledgerTransactionId = (insertedLt as { id: string }).id;
        }
    }

    return {
        entry_id: entryId,
        ledger_transaction_id: ledgerTransactionId!,
        schedule_id: scheduleId,
        amount_cents: netCents,
        mapping_keys_used: [...REQUIRED_KEYS],
    };
}

/**
 * Post vendor payout (cash out): Dr liability_vendor_payable, Cr asset_cash_operating.
 * Idempotent by (org_id, provider, provider_ref) for ledger_transactions and (org_id, source_type, source_id) for JE.
 */
export async function postVendorPayoutCashForSchedule(params: {
    supabase: SupabaseClient;
    orgId: string;
    scheduleId: string;
    provider?: string;
    providerRef?: string;
}): Promise<PostCashEventResult | PostCashEventError> {
    const { supabase, orgId, scheduleId, provider = "manual", providerRef = `schedule:${scheduleId}:vendor_payout` } = params;

    const loaded = await loadScheduleAndJob(supabase, orgId, scheduleId);
    if ("code" in loaded) return loaded;
    const { schedule, job } = loaded;

    const payoutCents = await computeVendorPayoutCents(supabase, orgId, schedule, job);

    const REQUIRED_KEYS = ["asset_cash_operating", "liability_vendor_payable"] as const;
    const { data: mappingsRows } = await supabase
        .from("gl_account_mappings")
        .select("key, gl_account_id")
        .eq("org_id", orgId)
        .in("key", [...REQUIRED_KEYS]);

    const mappingByKey = new Map<string, string>();
    (mappingsRows ?? []).forEach((r: { key: string; gl_account_id: string }) => {
        mappingByKey.set(r.key, r.gl_account_id);
    });
    const missing = REQUIRED_KEYS.filter((k) => !mappingByKey.get(k));
    if (missing.length > 0) return { code: "missing_mappings", keys: [...missing] };

    const { data: existingLt } = await supabase
        .from("ledger_transactions")
        .select("id, journal_entry_id")
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("provider_ref", providerRef)
        .maybeSingle();

    let ledgerTransactionId: string | undefined;
    let entryId: string;

    if (existingLt && (existingLt as { id: string }).id) {
        const existingEntryId = (existingLt as { journal_entry_id?: string | null }).journal_entry_id;
        if (existingEntryId) {
            return {
                entry_id: existingEntryId,
                ledger_transaction_id: (existingLt as { id: string }).id,
                schedule_id: scheduleId,
                amount_cents: payoutCents,
                mapping_keys_used: [...REQUIRED_KEYS],
            };
        }
        ledgerTransactionId = (existingLt as { id: string }).id;
    }

    const SOURCE_TYPE = "vendor_payout";
    const entryDate = schedule.start_at
        ? new Date(schedule.start_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
    const description = `Vendor payout: schedule ${scheduleId}`;

    const { data: existingEntry } = await supabase
        .from("gl_journal_entries")
        .select("id")
        .eq("org_id", orgId)
        .eq("source_type", SOURCE_TYPE)
        .eq("source_id", scheduleId)
        .maybeSingle();

    if (existingEntry && (existingEntry as { id: string }).id) {
        entryId = (existingEntry as { id: string }).id;
        await supabase
            .from("gl_journal_entries")
            .update({ description, status: "posted", entry_date: entryDate })
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

    await supabase.from("gl_journal_lines").delete().eq("org_id", orgId).eq("entry_id", entryId);

    const customerId = (job.customer_id ?? null) as string | null;
    const vendorId = schedule.assigned_vendor_id ?? job.assigned_vendor_id ?? null;
    type LineRow = {
        entry_id: string;
        org_id: string;
        job_id: string | null;
        schedule_id: string;
        customer_id: string | null;
        vendor_id: string | null;
        line_no: number;
        account_id: string;
        debit_cents: number;
        credit_cents: number;
        description?: string;
    };
    const stamp = {
        entry_id: entryId,
        org_id: orgId,
        job_id: job.id,
        schedule_id: scheduleId,
        customer_id: customerId,
        vendor_id: vendorId,
    };

    const lines: LineRow[] = [
        { ...stamp, line_no: 1, account_id: mappingByKey.get("liability_vendor_payable")!, debit_cents: payoutCents, credit_cents: 0, description: "Vendor payable" },
        { ...stamp, line_no: 2, account_id: mappingByKey.get("asset_cash_operating")!, debit_cents: 0, credit_cents: payoutCents, description: "Cash operating (payout)" },
    ];
    const { error: linesErr } = await supabase.from("gl_journal_lines").insert(lines);
    if (linesErr) throw linesErr;

    const now = new Date().toISOString();
    const ltRow = {
        org_id: orgId,
        occurred_at: now,
        status: "confirmed",
        type: "vendor_payout",
        direction: "out",
        amount_cents: payoutCents,
        currency: "USD",
        provider,
        provider_ref: providerRef,
        job_id: job.id,
        schedule_id: scheduleId,
        customer_id: customerId,
        vendor_id: vendorId,
        journal_entry_id: entryId,
    };

    if (ledgerTransactionId) {
        await supabase
            .from("ledger_transactions")
            .update({ journal_entry_id: entryId, amount_cents: payoutCents, occurred_at: now })
            .eq("id", ledgerTransactionId)
            .eq("org_id", orgId);
    } else {
        const { data: insertedLt, error: ltErr } = await supabase
            .from("ledger_transactions")
            .insert(ltRow)
            .select("id")
            .single();
        if (ltErr) {
            if (String(ltErr.code ?? "").toLowerCase() === "23505") {
                const { data: again } = await supabase
                    .from("ledger_transactions")
                    .select("id, journal_entry_id")
                    .eq("org_id", orgId)
                    .eq("provider", provider)
                    .eq("provider_ref", providerRef)
                    .maybeSingle();
                if (again && (again as { id: string }).id) {
                    ledgerTransactionId = (again as { id: string }).id;
                    entryId = (again as { journal_entry_id?: string | null }).journal_entry_id ?? entryId;
                } else {
                    throw ltErr;
                }
            } else {
                throw ltErr;
            }
        } else {
            ledgerTransactionId = (insertedLt as { id: string }).id;
        }
    }

    return {
        entry_id: entryId,
        ledger_transaction_id: ledgerTransactionId!,
        schedule_id: scheduleId,
        amount_cents: payoutCents,
        mapping_keys_used: [...REQUIRED_KEYS],
    };
}
