import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/ledger/[id] — ledger transaction detail + linked journal entry + lines
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: txn, error: txnErr } = await supabase
        .from("ledger_transactions")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .single();

    if (txnErr || !txn) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const t = txn as {
        customer_id?: string | null;
        vendor_id?: string | null;
        job_id?: string | null;
        schedule_id?: string | null;
        journal_entry_id?: string | null;
    };
    const [customerRes, vendorRes, jobRes, scheduleRes] = await Promise.all([
        t.customer_id ? supabase.from("customers").select("id, name").eq("id", t.customer_id).maybeSingle() : { data: null },
        t.vendor_id ? supabase.from("vendors").select("id, name").eq("id", t.vendor_id).maybeSingle() : { data: null },
        t.job_id ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("id", t.job_id).maybeSingle() : { data: null },
        t.schedule_id ? supabase.from("schedules").select("id, start_at, end_at").eq("id", t.schedule_id).maybeSingle() : { data: null },
    ]);
    const job = jobRes.data as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
    const _job_label = job
        ? (job.title && String(job.title).trim()) || (job.service_key && String(job.service_key).trim()) || (job.job_number_for_customer && String(job.job_number_for_customer).trim()) || `Job #${job.id.slice(-6)}`
        : null;
    const schedule = scheduleRes.data as { id: string; start_at?: string | null; end_at?: string | null } | null;
    const _schedule_label = schedule && (schedule.start_at || schedule.end_at) ? `${schedule.start_at ?? ""} – ${schedule.end_at ?? ""}`.trim() : schedule?.id?.slice(-8) ?? null;
    const linked = {
        _customer_name: customerRes.data ? (customerRes.data as { name?: string | null }).name ?? null : null,
        _vendor_name: vendorRes.data ? (vendorRes.data as { name?: string | null }).name ?? null : null,
        _job_label,
        _schedule_label,
    };

    const journalEntryId = t.journal_entry_id;
    let entry: Record<string, unknown> | null = null;
    let lines: Record<string, unknown>[] = [];

    if (journalEntryId) {
        const { data: entryRow, error: entryErr } = await supabase
            .from("gl_journal_entries")
            .select("*")
            .eq("id", journalEntryId)
            .eq("org_id", orgId)
            .single();
        if (!entryErr && entryRow) entry = entryRow as Record<string, unknown>;

        const { data: lineRows, error: linesErr } = await supabase
            .from("gl_journal_lines")
            .select("id, line_no, account_id, description, debit_cents, credit_cents, currency")
            .eq("entry_id", journalEntryId)
            .eq("org_id", orgId)
            .order("line_no", { ascending: true });
        if (!linesErr && lineRows) {
            const accountIds = [...new Set((lineRows as { account_id: string }[]).map((l) => l.account_id))];
            const { data: accounts } = accountIds.length
                ? await supabase.from("gl_accounts").select("id, code, name, type").in("id", accountIds)
                : { data: [] };
            const accountMap = new Map((accounts ?? []).map((a) => [(a as { id: string }).id, a]));
            lines = (lineRows as Record<string, unknown>[]).map((l) => ({
                ...l,
                account: accountMap.get(l.account_id as string) ?? null,
            }));
        }
    }

    return NextResponse.json({
        transaction: { ...txn, ...linked },
        journalEntry: entry,
        journalLines: lines,
    });
}
