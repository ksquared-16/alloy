import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * THE ACCOUNTING CALENDAR, MADE VISIBLE.
 *
 * ── WHAT WAS TRUE BEFORE THIS ROUTE ────────────────────────────────────────────────────────────
 *
 * `financial_accounting_calendars` and `financial_accounting_periods` are canonical and enforced:
 * an organisation may hold at most ONE active calendar (a unique index says so, because "pick one"
 * is how a posted row's period becomes a matter of query order); each period carries a status of
 * `open` or `closed`; the `attribute_financial_journal_entry` trigger decides every journal entry's
 * period at INSERT; a second trigger freezes a period's boundaries once anything has posted into
 * it; and `financialJournalService` already translates the database's `accounting_period_closed`
 * refusal into an operator sentence.
 *
 * All of that existed and NO HUMAN COULD SEE ANY OF IT. There was no screen listing calendars, no
 * screen showing which period is open, and no way to learn that a refusal came from a closed month.
 * Thread 11A recorded it as MISSING_PRODUCTIZATION twice; this route is the read half of closing it.
 *
 * ── READ ONLY, DELIBERATELY ────────────────────────────────────────────────────────────────────
 *
 * It opens nothing and closes nothing. Closing a period is a governed lifecycle act with real
 * consequences — it is what makes a month's figures final — and no governed close/reopen action
 * exists yet anywhere in the platform. Writing one here, around the journal enforcement, is exactly
 * the shortcut the instruction forbids and the trigger exists to prevent. The missing action is
 * reported as a bounded product gap instead.
 *
 * `fin.read`, like every other Financials read.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const { data: calendars, error: calendarError } = await supabase
        .from("financial_accounting_calendars")
        .select("id, calendar_key, name, period_style, is_active")
        .eq("org_id", ctx.orgId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });
    if (calendarError) return NextResponse.json({ error: calendarError.message }, { status: 500 });

    const rows = (calendars ?? []) as Array<{
        id: string;
        calendar_key: string;
        name: string;
        period_style: string;
        is_active: boolean;
    }>;
    if (rows.length === 0) {
        /*
         * A tenant with no calendar is a real and reportable state: journal attribution has nothing
         * to resolve against, and the trigger will refuse posting rather than guess a period. The
         * surface says so instead of rendering an empty table that looks like a working calendar.
         */
        return NextResponse.json({ ok: true, calendars: [], periods: [], today: new Date().toISOString().slice(0, 10) });
    }

    const { data: periods, error: periodError } = await supabase
        .from("financial_accounting_periods")
        .select("id, calendar_id, period_key, label, starts_on, ends_on, status, closed_at")
        .eq("org_id", ctx.orgId)
        .in("calendar_id", rows.map((c) => c.id))
        .order("starts_on", { ascending: false });
    if (periodError) return NextResponse.json({ error: periodError.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        calendars: rows,
        periods: periods ?? [],
        /* The server's day, so "the period we are in" is not decided by a browser clock. */
        today: new Date().toISOString().slice(0, 10),
    });
}
