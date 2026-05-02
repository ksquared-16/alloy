import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/journal-entries/[id]
 * Returns entry + lines with account code/name. Auth: getAdminContextCached().
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id: entryId } = await context.params;
    if (!entryId) return NextResponse.json({ error: "Missing entry id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: entryRow, error: entryErr } = await supabase
        .from("gl_journal_entries")
        .select("id, entry_date, status, source_type, source_id, description, created_at")
        .eq("id", entryId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (entryErr || !entryRow) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: lineRows, error: linesErr } = await supabase
        .from("gl_journal_lines")
        .select("line_no, account_id, debit_cents, credit_cents, job_id, schedule_id, customer_id, vendor_id")
        .eq("entry_id", entryId)
        .eq("org_id", orgId)
        .order("line_no", { ascending: true });

    if (linesErr) {
        return NextResponse.json({ error: linesErr.message }, { status: 500 });
    }

    const lineList = (lineRows ?? []) as { line_no: number; account_id: string; debit_cents: number; credit_cents: number; job_id: string | null; schedule_id: string | null; customer_id: string | null; vendor_id: string | null }[];
    const accountIds = [...new Set(lineList.map((l) => l.account_id))];
    const { data: accounts } = accountIds.length
        ? await supabase.from("gl_accounts").select("id, code, name").in("id", accountIds)
        : { data: [] };
    const accountMap = new Map((accounts ?? []).map((a) => [(a as { id: string }).id, a as { code: string | null; name: string | null }]));

    const lines = lineList.map((l) => {
        const acc = accountMap.get(l.account_id);
        return {
            line_no: l.line_no,
            account_id: l.account_id,
            account_code: (acc?.code ?? null) as string | null,
            account_name: (acc?.name ?? null) as string | null,
            debit_cents: Number(l.debit_cents) || 0,
            credit_cents: Number(l.credit_cents) || 0,
            job_id: l.job_id,
            schedule_id: l.schedule_id,
            customer_id: l.customer_id,
            vendor_id: l.vendor_id,
        };
    });

    return NextResponse.json({
        entry: {
            id: (entryRow as { id: string }).id,
            entry_date: (entryRow as { entry_date?: string | null }).entry_date ?? null,
            status: (entryRow as { status?: string | null }).status ?? null,
            source_type: (entryRow as { source_type?: string | null }).source_type ?? null,
            source_id: (entryRow as { source_id?: string | null }).source_id ?? null,
            description: (entryRow as { description?: string | null }).description ?? null,
            created_at: (entryRow as { created_at?: string | null }).created_at ?? null,
        },
        lines,
    });
}
