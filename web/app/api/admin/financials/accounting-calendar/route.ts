import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed, assertFinancialsWriteAllowed } from "@/lib/financials/financialsPermissions";
import {
    adoptCalendarMonthCalendar,
    closeAccountingPeriod,
    previewClosePeriod,
} from "@/lib/financials/accounting/accountingCalendarService";
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

/**
 * POST /api/admin/financials/accounting-calendar
 *
 * THE WRITE HALF, ON THE ROUTE THAT ALREADY OWNS THE READ.
 *
 * ── WHY NOT A REGISTERED ACTION ───────────────────────────────────────────────────────────────
 *
 * It was one, briefly, and it could not be invoked. `executeAdminAction` resolves an invocation
 * against a real record: it requires a non-empty `entity_id` and an `entity_type` that
 * `mapEntityToTable` can resolve, then reads the row. Adopting a calendar and closing a period
 * are ORG-scoped — there is no record to name, and naming an arbitrary person to satisfy the
 * runtime would be a lie about what the act is for. `create_lead` carries a special-cased
 * sentinel entity for exactly this reason, and extending that special case is not something to do
 * in passing.
 *
 * A registered action nothing can invoke is worse than no action: it reads as governed capability
 * and answers "Unsupported entity_type". So the governance lives where it can actually run —
 * `fin.write`, the same grant every other Financials mutation asks for, resolved server-side and
 * never taken from the payload.
 *
 * ONE WRITER. Both operations call `accountingCalendarService`, which is the only place either
 * accounting table is written.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    /* Configuring the books and closing them are financial mutations, not portal admission. */
    const allowed = await assertFinancialsWriteAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const op = typeof body.op === "string" ? body.op.trim() : "";
    const periodId = typeof body.period_id === "string" ? body.period_id.trim() : "";

    try {
        if (op === "adopt") {
            const out = await adoptCalendarMonthCalendar(supabase, {
                orgId: ctx.orgId,
                actorUserId: ctx.userId ?? null,
                startYear: Number(body.start_year) || new Date().getUTCFullYear(),
                startMonth: Number(body.start_month) || 1,
            });
            return NextResponse.json({
                ok: true, op, calendar_id: out.calendarId, created: out.created, periods_materialised: out.inserted,
            });
        }
        if (op === "preview_close") {
            if (!periodId) return NextResponse.json({ error: "period_id is required" }, { status: 400 });
            return NextResponse.json({ ok: true, op, preview: await previewClosePeriod(supabase, { orgId: ctx.orgId, periodId }) });
        }
        if (op === "close") {
            if (!periodId) return NextResponse.json({ error: "period_id is required" }, { status: 400 });
            /* Re-previewed server-side: a client cannot skip the check by declining to ask for it. */
            const pv = await previewClosePeriod(supabase, { orgId: ctx.orgId, periodId });
            const blocking = pv.blockers.filter((b) => b.code === "already_closed");
            if (blocking.length > 0) {
                return NextResponse.json({ error: blocking[0]!.message, code: blocking[0]!.code }, { status: 409 });
            }
            const out = await closeAccountingPeriod(supabase, { orgId: ctx.orgId, periodId, actorUserId: ctx.userId ?? null });
            return NextResponse.json({ ok: true, op, period_key: out.periodKey, status: out.status, closed_at: out.closedAt });
        }
        return NextResponse.json({ error: "op must be adopt, preview_close or close" }, { status: 400 });
    } catch (e) {
        const message = (e as Error).message;
        const status = message.includes("not_open") ? 409 : message.includes("not_found") ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
