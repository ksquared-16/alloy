/**
 * MAKE EXISTING SCHEDULED WORK DUE NOW — and nothing else.
 *
 * ── WHAT THIS IS, SAID AS A BOUNDARY ──────────────────────────────────────────────────────────
 *
 * This moves one schedule's next due moment to now. It does NOT run anything. It does not invoke a
 * handler, materialize an occurrence, claim, lease, or write a domain row. After it returns, the
 * work is simply due, and the ordinary clock discovers it on its next tick exactly as it would
 * have discovered it tomorrow.
 *
 * That distinction is the whole reason this is safe to expose. "Run billing now" would be a second
 * execution path that has to be certified separately and would bypass the claim model the runtime
 * exists to own. "Make due now" borrows nothing: the chain that follows is still
 * clock → due work → claim/lease → registered handler → outcome → retry.
 *
 * ── DOMAIN-NEUTRAL ON PURPOSE ─────────────────────────────────────────────────────────────────
 *
 * It knows nothing about billing, autopay or aging. A domain asks for its own schedule by id and
 * supplies its own authorization; the only questions asked here are scheduling questions.
 *
 * ── WHY A CLAIMED SCHEDULE IS REFUSED RATHER THAN RE-DUED ─────────────────────────────────────
 *
 * If an occurrence is running under a live lease, pulling the schedule forward invites a second
 * occurrence for work already in flight. The runtime would survive it — generation converges — but
 * the operator would have been told "evaluating" twice for one evaluation. The concurrency
 * doctrine already belongs to the claim, so this defers to it instead of racing it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveScheduledWorkHandler } from "@/lib/scheduledWork/scheduledWorkRegistry";

export type MakeDueNowResult =
    | {
          outcome: "evaluation_requested";
          scheduleId: string;
          handlerKey: string;
          previousNextDueAt: string | null;
          nextDueAt: string;
      }
    | {
          outcome: "refused";
          reason:
              | "schedule_not_found"
              | "schedule_inactive"
              | "handler_not_registered"
              | "occurrence_in_flight";
          scheduleId: string | null;
          detail: string;
      };

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function makeScheduledWorkDueNow(
    supabase: SupabaseClient,
    args: { orgId: string; scheduleId: string; now?: Date },
): Promise<MakeDueNowResult> {
    const now = args.now ?? new Date();
    const nowIso = now.toISOString();
    const scheduleId = t(args.scheduleId);

    /* The org filter is part of the lookup, so a schedule in another tenant is simply not found. */
    const { data } = await supabase
        .from("scheduled_work")
        .select("id, org_id, handler_key, is_active, next_due_at")
        .eq("id", scheduleId)
        .eq("org_id", args.orgId)
        .maybeSingle();

    const row = (data ?? null) as
        | { id: string; org_id: string | null; handler_key: string; is_active: boolean; next_due_at: string | null }
        | null;

    if (!row) {
        return {
            outcome: "refused",
            reason: "schedule_not_found",
            scheduleId: scheduleId || null,
            detail: "No such scheduled work in this organization.",
        };
    }
    if (!row.is_active) {
        /* Deliberately stopped is a decision. Re-duing it would restart automation by side effect. */
        return {
            outcome: "refused",
            reason: "schedule_inactive",
            scheduleId: row.id,
            detail: "This scheduled work is stopped. Activate it before asking for an evaluation.",
        };
    }
    if (!resolveScheduledWorkHandler(row.handler_key)) {
        return {
            outcome: "refused",
            reason: "handler_not_registered",
            scheduleId: row.id,
            detail: `No registered handler: ${row.handler_key}.`,
        };
    }

    /* An occurrence still held under a live lease is work in flight. */
    const { data: inFlight } = await supabase
        .from("scheduled_work_occurrences")
        .select("id, status, lease_expires_at")
        .eq("scheduled_work_id", row.id)
        .in("status", ["pending", "claimed"])
        .not("lease_expires_at", "is", null)
        .gt("lease_expires_at", nowIso)
        .limit(1);
    if (((inFlight ?? []) as unknown[]).length > 0) {
        return {
            outcome: "refused",
            reason: "occurrence_in_flight",
            scheduleId: row.id,
            detail: "An evaluation of this scheduled work is already running.",
        };
    }

    /*
     * The only mutation: when it is next due. Handler, organization, domain payload, attempts,
     * claim tokens and leases are all left exactly as they were.
     */
    await supabase
        .from("scheduled_work")
        .update({ next_due_at: nowIso, updated_at: nowIso })
        .eq("id", row.id)
        .eq("org_id", args.orgId);

    return {
        outcome: "evaluation_requested",
        scheduleId: row.id,
        handlerKey: row.handler_key,
        previousNextDueAt: row.next_due_at,
        nextDueAt: nowIso,
    };
}
