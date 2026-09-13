/**
 * Quiet financial context for Attendance — a POINTER, never a calculation.
 *
 * ── WHAT THIS IS ALLOWED TO SAY ──
 *
 * Thread 7 promoted the chain: an attendance fact reaches the consumption
 * reactor, which records a `consumption_events` row whose `status` says what
 * became of it. Those four words are canonically knowable, so Attendance may
 * repeat them:
 *
 *   recorded        something followed from this and is not settled yet
 *   resolved        it was answered — a charge, or a credit
 *   no_obligation   nothing financial follows
 *   superseded      replaced by a later statement
 *
 * ── WHAT IT MUST NEVER SAY ──
 *
 * No amounts, no rates, no credit values, no totals. Attendance recreating
 * financial math is the failure Thread 7's architecture exists to prevent, and
 * the version that does it "just for display" is the one that silently disagrees
 * with the ledger. There is no number anywhere in this module and no code path
 * that could produce one: it reads a status column and counts rows.
 *
 * Monetary investigation belongs in Financials, which is why the only other
 * thing here is a link there.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The family the attendance consumption reactor stamps on what it records. */
export const ATTENDANCE_CONSUMPTION_FAMILY = "attendance";

export type ConsequenceStatus = "recorded" | "resolved" | "no_obligation" | "superseded";

export type AttendanceConsequenceContext = {
    childCustomerMemberId: string;
    /** How many attendance-sourced consumption events sit in each state. */
    counts: Record<ConsequenceStatus, number>;
    /** True when anything followed from attendance at all. */
    hasAnyConsequence: boolean;
    /** True when something followed and is not settled. */
    hasUnresolved: boolean;
    /** Where an operator goes to investigate the money. */
    financialsHref: string;
};

const EMPTY_COUNTS: Record<ConsequenceStatus, number> = {
    recorded: 0,
    resolved: 0,
    no_obligation: 0,
    superseded: 0,
};

const KNOWN: readonly ConsequenceStatus[] = ["recorded", "resolved", "no_obligation", "superseded"];

/** Operator phrasing. Status keys must not reach the screen. */
export function consequenceStatusLabel(status: ConsequenceStatus): string {
    switch (status) {
        case "recorded":
            return "Awaiting a billing decision";
        case "resolved":
            return "Settled in billing";
        case "no_obligation":
            return "No effect on billing";
        case "superseded":
            return "Replaced by a later record";
    }
}

/**
 * One operator-facing sentence, or null when there is nothing worth saying.
 *
 * Null is the common case and it is deliberate: a child whose attendance had no
 * financial consequence should see NOTHING, not a reassuring empty state. A
 * quiet context line that appears on every record stops being read.
 */
export function consequenceSummarySentence(ctx: AttendanceConsequenceContext): string | null {
    if (!ctx.hasAnyConsequence) return null;
    if (ctx.counts.recorded > 0) {
        return ctx.counts.recorded === 1 ?
                "One attendance day is waiting on a billing decision."
            :   `${ctx.counts.recorded} attendance days are waiting on a billing decision.`;
    }
    if (ctx.counts.resolved > 0) return "Attendance has been settled in billing.";
    return null;
}

export async function loadAttendanceConsequenceContext(
    supabase: SupabaseClient,
    orgId: string,
    childCustomerMemberId: string,
    range?: { dateStart?: string; dateEnd?: string },
): Promise<AttendanceConsequenceContext> {
    const base: AttendanceConsequenceContext = {
        childCustomerMemberId,
        counts: { ...EMPTY_COUNTS },
        hasAnyConsequence: false,
        hasUnresolved: false,
        financialsHref: "/adminV2/financials",
    };
    if (!childCustomerMemberId) return base;

    // Only `status` is read. There is deliberately no join to obligations or
    // amounts: this module has no reason to know what anything costs.
    let query = supabase
        .from("consumption_events")
        .select("status")
        .eq("org_id", orgId)
        .eq("source_family", ATTENDANCE_CONSUMPTION_FAMILY)
        .eq("subject_id", childCustomerMemberId);
    if (range?.dateStart) query = query.gte("occurs_on", range.dateStart);
    if (range?.dateEnd) query = query.lte("occurs_on", range.dateEnd);

    const { data, error } = await query;
    if (error) return base;

    const counts = { ...EMPTY_COUNTS };
    for (const row of (data ?? []) as { status: string | null }[]) {
        const s = row.status as ConsequenceStatus | null;
        // An unrecognised status is counted nowhere rather than folded into a
        // known bucket — miscounting it as `no_obligation` would say "nothing
        // follows" about something the product does not understand.
        if (s && KNOWN.includes(s)) counts[s] += 1;
    }

    const hasAnyConsequence = KNOWN.some((s) => counts[s] > 0);
    return {
        ...base,
        counts,
        hasAnyConsequence,
        hasUnresolved: counts.recorded > 0,
    };
}
