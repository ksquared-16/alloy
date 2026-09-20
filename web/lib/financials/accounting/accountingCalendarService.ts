import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarMonthPeriods, type AccountingPeriodShape } from "@/lib/financials/accountingPeriod";

/**
 * THE WRITE HALF OF ACCOUNTING PERIODS.
 *
 * Everything that DECIDES attribution already existed and none of it could be reached: the tables,
 * the one-active-calendar index, the no-overlap constraint, the boundary freeze and the
 * `attribute_financial_journal_entry` trigger are all canonical, and no INSERT, UPDATE or DELETE
 * against either table existed anywhere in application code. On a tenant with no calendar every
 * journal entry is stamped `no_calendar`, so the whole system sat inert behind a read-only screen.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
 *
 * No soft close, no adjusting or 13th period, no multi-book, no consolidation. The lifecycle is
 * the one the schema already models — a period is `open` or `closed`, and closing stamps who and
 * when — because the database's CHECK is the product decision and inventing states above it would
 * be a second vocabulary nothing enforces.
 *
 * Periods are MATERIALISED from the calendar rather than authored one at a time. The shapes come
 * from `accountingPeriod.ts`, which already generates them and is the only place that arithmetic
 * lives; this writes what that returns. A second generator would be a second answer to "when does
 * September end".
 */

export type AccountingCloseBlocker = { code: string; message: string };

export type ClosePeriodPreview = {
    periodKey: string;
    label: string | null;
    startsOn: string;
    endsOn: string;
    status: string;
    /** Entries already attributed here. Closing does not move them; it stops NEW ones arriving. */
    attributedEntries: number;
    /** Where entries effective in this period will land once it is closed, if anywhere. */
    defersTo: { periodKey: string; startsOn: string } | null;
    blockers: AccountingCloseBlocker[];
};

/** One active calendar per org — the partial unique index says so; this reads the same answer. */
export async function readActiveCalendar(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ id: string; calendarKey: string; name: string; periodStyle: string } | null> {
    const { data, error } = await supabase
        .from("financial_accounting_calendars")
        .select("id, calendar_key, name, period_style")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(`accounting calendar could not be read (${error.message.trim()})`);
    if (!data) return null;
    const row = data as { id: string; calendar_key: string; name: string; period_style: string };
    return { id: row.id, calendarKey: row.calendar_key, name: row.name, periodStyle: row.period_style };
}

/**
 * Adopt a calendar-month accounting calendar and materialise its twelve periods.
 *
 * Idempotent on the calendar key, and period inserts ignore conflicts on
 * `(calendar_id, period_key)` — re-running adds the periods a previous run did not reach rather
 * than failing on the ones it did. Boundaries of an existing period are never rewritten: the
 * database freezes them once anything has posted, and this does not try to.
 */
export async function adoptCalendarMonthCalendar(
    supabase: SupabaseClient,
    args: { orgId: string; actorUserId: string | null; startYear: number; startMonth?: number; name?: string },
): Promise<{ calendarId: string; created: boolean; periods: AccountingPeriodShape[]; inserted: number }> {
    const startMonth = args.startMonth ?? 1;
    const calendarKey = `FY${args.startYear}`;
    const existing = await readActiveCalendar(supabase, args.orgId);

    let calendarId: string;
    let created = false;
    if (existing) {
        calendarId = existing.id;
    } else {
        const { data, error } = await supabase
            .from("financial_accounting_calendars")
            .insert({
                org_id: args.orgId,
                calendar_key: calendarKey,
                name: args.name ?? `Fiscal ${args.startYear}`,
                period_style: "calendar_month",
                is_active: true,
                created_by: args.actorUserId,
                updated_by: args.actorUserId,
            })
            .select("id")
            .single();
        if (error) throw new Error(`accounting calendar could not be created (${error.message.trim()})`);
        calendarId = String((data as { id: string }).id);
        created = true;
    }

    const shapes = calendarMonthPeriods({ startYear: args.startYear, startMonth, keyPrefix: calendarKey });
    const { data: have } = await supabase
        .from("financial_accounting_periods")
        .select("period_key")
        .eq("org_id", args.orgId)
        .eq("calendar_id", calendarId);
    const known = new Set(((have ?? []) as Array<{ period_key: string }>).map((r) => r.period_key));
    const missing = shapes.filter((s) => !known.has(s.period_key));
    if (missing.length > 0) {
        const { error } = await supabase.from("financial_accounting_periods").insert(
            missing.map((s) => ({
                org_id: args.orgId,
                calendar_id: calendarId,
                period_key: s.period_key,
                label: s.label,
                starts_on: s.starts_on,
                ends_on: s.ends_on,
                status: "open",
            })),
        );
        if (error) throw new Error(`accounting periods could not be materialised (${error.message.trim()})`);
    }
    return { calendarId, created, periods: shapes, inserted: missing.length };
}

/**
 * What closing this period would mean, answered from canonical rows.
 *
 * ── WHAT CLOSE CHECKS, AND WHAT IT DOES NOT ───────────────────────────────────────────────────
 *
 * It checks that the period exists on the active calendar and is not already closed. That is all,
 * and the omission is deliberate: this platform has no doctrine making reconciliation, posting
 * review or draft work a close blocker, and inventing one here would be a finance rule nobody
 * asked for, enforced in the one place nobody would look for it. Drafts are not journal entries —
 * they carry no attribution at all — so an unposted charge cannot be "in" the period being closed.
 *
 * What it DOES report is the consequence: how many entries are already attributed here (closing
 * moves none of them) and which period later entries will defer into. If there is no later open
 * period, closing this one makes the trigger refuse those writes outright — so the preview says so
 * before the operator finds out by being unable to bill a family.
 */
export async function previewClosePeriod(
    supabase: SupabaseClient,
    args: { orgId: string; periodId: string },
): Promise<ClosePeriodPreview> {
    const { data, error } = await supabase
        .from("financial_accounting_periods")
        .select("id, calendar_id, period_key, label, starts_on, ends_on, status")
        .eq("org_id", args.orgId)
        .eq("id", args.periodId)
        .maybeSingle();
    if (error) throw new Error(`accounting period could not be read (${error.message.trim()})`);
    if (!data) throw new Error("accounting_period_not_found");
    const p = data as {
        id: string; calendar_id: string; period_key: string; label: string | null;
        starts_on: string; ends_on: string; status: string;
    };

    const blockers: AccountingCloseBlocker[] = [];
    if (p.status === "closed") {
        blockers.push({ code: "already_closed", message: `${p.label ?? p.period_key} is already closed.` });
    }

    const { count } = await supabase
        .from("financial_journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", args.orgId)
        .eq("accounting_period_id", p.id);

    const { data: nextOpen } = await supabase
        .from("financial_accounting_periods")
        .select("period_key, starts_on")
        .eq("org_id", args.orgId)
        .eq("calendar_id", p.calendar_id)
        .eq("status", "open")
        .gt("starts_on", p.ends_on)
        .order("starts_on", { ascending: true })
        .limit(1)
        .maybeSingle();
    const defersTo = nextOpen
        ? { periodKey: String((nextOpen as { period_key: string }).period_key), startsOn: String((nextOpen as { starts_on: string }).starts_on) }
        : null;
    if (!defersTo && p.status !== "closed") {
        /*
         * NOT A BLOCKER — A WARNING THE OPERATOR MUST SEE. Closing the last open period is legal
         * and sometimes correct, but it turns the trigger's deferral into a refusal: money
         * effective in this period would then have nowhere to post at all.
         */
        blockers.push({
            code: "no_later_open_period",
            message:
                "No later open period exists. Once this one closes, a posting effective in it will be "
                + "refused rather than deferred — open the next period first unless that is intended.",
        });
    }

    return {
        periodKey: p.period_key, label: p.label, startsOn: p.starts_on, endsOn: p.ends_on,
        status: p.status, attributedEntries: count ?? 0, defersTo, blockers,
    };
}

/** Close it. Status only — boundaries are frozen by the database once anything has posted. */
export async function closeAccountingPeriod(
    supabase: SupabaseClient,
    args: { orgId: string; periodId: string; actorUserId: string | null },
): Promise<{ periodKey: string; status: string; closedAt: string | null }> {
    const { data, error } = await supabase
        .from("financial_accounting_periods")
        .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: args.actorUserId })
        .eq("org_id", args.orgId)
        .eq("id", args.periodId)
        .eq("status", "open")
        .select("period_key, status, closed_at")
        .maybeSingle();
    if (error) throw new Error(`accounting period could not be closed (${error.message.trim()})`);
    /* Nothing updated means it was not open — answered as itself rather than reported as success. */
    if (!data) throw new Error("accounting_period_not_open");
    const row = data as { period_key: string; status: string; closed_at: string | null };
    return { periodKey: row.period_key, status: row.status, closedAt: row.closed_at };
}
