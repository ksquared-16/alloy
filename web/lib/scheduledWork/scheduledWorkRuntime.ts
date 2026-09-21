import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveScheduledWorkHandler } from "@/lib/scheduledWork/scheduledWorkRegistry";
import {
    computeNextDueAt,
    retryDelaySeconds,
    SCHEDULED_WORK_MAX_ATTEMPTS,
    type RecurrenceKind,
    type ScheduledWorkOutcome,
} from "@/lib/scheduledWork/scheduledWorkTypes";

/**
 * THE RUNTIME — wake, claim, run, converge.
 *
 * One clock, one claim model, one retry model, one handler registry. Everything
 * domain-specific begins after `resolveScheduledWorkHandler` returns.
 *
 * ── THE CLAIM IS THE CONCURRENCY ARGUMENT ──
 *
 * Claiming is a single conditional UPDATE that stamps a fresh `claim_token` and a
 * lease, filtered to rows that are due and either unleased or whose lease has
 * expired. Two workers racing the same row produce one winner because the second
 * UPDATE matches nothing — the database decides, not a read-then-write in
 * application code that would interleave.
 *
 * Finalizing re-checks that same token. A worker that stalled past its lease and
 * came back cannot overwrite the result of whoever took over: its token is stale,
 * its UPDATE matches nothing, and it discovers it lost rather than corrupting the
 * record of what happened.
 *
 * ── POISON ISOLATION ──
 *
 * Occurrences are claimed and executed one at a time, each in its own try/catch.
 * A handler that throws fails ITS occurrence and the loop continues, because one
 * bad schedule must not stop unrelated due work from running.
 */

export type WakeResult = {
    workerId: string;
    claimed: number;
    completed: number;
    retryScheduled: number;
    terminallyFailed: number;
    unregisteredHandler: number;
    occurrences: { id: string; handlerKey: string; outcome: string }[];
};

const LEASE_SECONDS = 300;

type OccurrenceRow = {
    id: string;
    scheduled_work_id: string;
    org_id: string | null;
    handler_key: string;
    due_at: string;
    attempt_count: number;
    domain_ref: Record<string, unknown>;
};

/**
 * Materialize occurrences for every schedule whose next due moment has arrived.
 *
 * Separate from claiming on purpose: materializing is idempotent through the
 * `(scheduled_work_id, due_at)` unique index, so a duplicate wake converges onto
 * the existing occurrence instead of creating a second one for the same moment.
 */
export async function materializeDueOccurrences(
    supabase: SupabaseClient,
    now: Date,
): Promise<number> {
    const { data } = await supabase
        .from("scheduled_work")
        .select("id, org_id, handler_key, recurrence_kind, interval_seconds, next_due_at, domain_ref")
        .eq("is_active", true)
        .not("next_due_at", "is", null)
        .lte("next_due_at", now.toISOString())
        .limit(200);

    const schedules = (data ?? []) as {
        id: string; org_id: string | null; handler_key: string;
        recurrence_kind: RecurrenceKind; interval_seconds: number | null;
        next_due_at: string; domain_ref: Record<string, unknown>;
    }[];

    let created = 0;
    for (const s of schedules) {
        // `ignoreDuplicates` is the convergence: a second wake for the same moment
        // is not an error, it is the same occurrence.
        const { error } = await supabase
            .from("scheduled_work_occurrences")
            .upsert(
                {
                    scheduled_work_id: s.id,
                    org_id: s.org_id,
                    handler_key: s.handler_key,
                    due_at: s.next_due_at,
                    domain_ref: s.domain_ref ?? {},
                    status: "pending",
                },
                { onConflict: "scheduled_work_id,due_at", ignoreDuplicates: true },
            );
        if (!error) created += 1;

        // Advance the schedule so the same moment is not materialized forever.
        // A domain-computed schedule parks at null until its handler supplies the
        // next one, which is the domain owning its own cadence.
        const next = computeNextDueAt(s.recurrence_kind, s.next_due_at, s.interval_seconds);
        await supabase
            .from("scheduled_work")
            .update({ next_due_at: next, updated_at: new Date().toISOString() })
            .eq("id", s.id);
    }
    return created;
}

/**
 * Claim exactly ONE occurrence.
 *
 * Two steps, and the second is the one that matters. A bare UPDATE with a filter
 * would have claimed EVERY due row at once — PostgREST has no LIMIT on update, so
 * the first version stamped one token across all matching rows and then returned
 * nothing, because `maybeSingle()` refuses a multi-row result. It passed while
 * only one occurrence existed and broke the moment two did, which is precisely
 * the case the poison-isolation test exists to create.
 *
 * So: pick a candidate, then update it CONDITIONALLY. The atomicity argument is
 * unchanged and still lives in the WHERE clause — the update matches only if the
 * row is still claimable, so a worker that lost the race between the select and
 * the update simply matches nothing and moves to the next candidate. The select
 * chooses who to try for; the update decides who wins.
 */
async function claimOne(
    supabase: SupabaseClient,
    now: Date,
    workerId: string,
    claimToken: string,
): Promise<OccurrenceRow | null> {
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();

    const { data: candidates } = await supabase
        .from("scheduled_work_occurrences")
        .select("id")
        .in("status", ["pending", "claimed"])
        .lte("due_at", nowIso)
        .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
        .lt("attempt_count", SCHEDULED_WORK_MAX_ATTEMPTS)
        .order("due_at", { ascending: true })
        .limit(10);

    for (const candidate of ((candidates ?? []) as { id: string }[])) {
        const { data } = await supabase
            .from("scheduled_work_occurrences")
            .update({
                status: "claimed",
                claim_token: claimToken,
                claimed_by: workerId,
                lease_expires_at: leaseUntil,
                updated_at: nowIso,
            })
            .eq("id", candidate.id)
            // Re-asserted at write time: whoever got here first already changed these.
            .in("status", ["pending", "claimed"])
            .lte("due_at", nowIso)
            .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
            .lt("attempt_count", SCHEDULED_WORK_MAX_ATTEMPTS)
            .select("id, scheduled_work_id, org_id, handler_key, due_at, attempt_count, domain_ref")
            .maybeSingle();
        if (data) return data as OccurrenceRow;
    }
    return null;
}

/**
 * Apply an outcome, but ONLY if this worker still holds the lease.
 *
 * The `claim_token` filter is the guard: a stale worker's update matches no row.
 */
async function finalize(
    supabase: SupabaseClient,
    occ: OccurrenceRow,
    claimToken: string,
    attemptNumber: number,
    outcome: ScheduledWorkOutcome,
    now: Date,
): Promise<"applied" | "lost_lease"> {
    const nowIso = now.toISOString();
    const patch: Record<string, unknown> = { updated_at: nowIso, attempt_count: attemptNumber };

    if (outcome.kind === "completed") {
        patch.status = "completed";
        patch.completed_at = nowIso;
        patch.claim_token = null;
        patch.lease_expires_at = null;
    } else if (outcome.kind === "retryable_failure" && attemptNumber < SCHEDULED_WORK_MAX_ATTEMPTS) {
        // Back to pending, due later. Bounded: the attempt_count filter in the claim
        // stops this once the budget is spent.
        patch.status = "pending";
        patch.claim_token = null;
        patch.lease_expires_at = null;
        patch.due_at = new Date(now.getTime() + retryDelaySeconds(attemptNumber) * 1000).toISOString();
        patch.last_failure_at = nowIso;
        patch.failure_reason = outcome.reason ?? "retryable failure";
    } else {
        // Terminal: the handler said so, or the retry budget is exhausted. It stays
        // durable and visible, and it is not tried again every tick.
        patch.status = "failed";
        patch.claim_token = null;
        patch.lease_expires_at = null;
        patch.last_failure_at = nowIso;
        patch.failure_reason = outcome.reason
            ?? (outcome.kind === "retryable_failure" ? "retry budget exhausted" : "terminal failure");
    }

    const { data } = await supabase
        .from("scheduled_work_occurrences")
        .update(patch)
        .eq("id", occ.id)
        .eq("claim_token", claimToken)
        .select("id")
        .maybeSingle();

    return data ? "applied" : "lost_lease";
}

export async function runScheduledWorkWake(
    supabase: SupabaseClient,
    options: { now?: Date; maxOccurrences?: number; workerId?: string } = {},
): Promise<WakeResult> {
    const now = options.now ?? new Date();
    const workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
    const budget = options.maxOccurrences ?? 25;

    await materializeDueOccurrences(supabase, now);

    const result: WakeResult = {
        workerId, claimed: 0, completed: 0, retryScheduled: 0,
        terminallyFailed: 0, unregisteredHandler: 0, occurrences: [],
    };

    for (let i = 0; i < budget; i += 1) {
        const claimToken = randomUUID();
        const occ = await claimOne(supabase, now, workerId, claimToken);
        if (!occ) break;
        result.claimed += 1;
        const attemptNumber = (occ.attempt_count ?? 0) + 1;

        const { data: attempt } = await supabase
            .from("scheduled_work_attempts")
            .insert({
                occurrence_id: occ.id, org_id: occ.org_id, handler_key: occ.handler_key,
                attempt_number: attemptNumber, worker_id: workerId, claim_token: claimToken,
            })
            .select("id")
            .maybeSingle();

        let outcome: ScheduledWorkOutcome;
        const handler = resolveScheduledWorkHandler(occ.handler_key);
        if (!handler) {
            // A row naming code that does not exist cannot run. Terminal, and loud.
            result.unregisteredHandler += 1;
            outcome = { kind: "terminal_failure", reason: `no registered handler: ${occ.handler_key}` };
        } else {
            try {
                outcome = await handler({
                    scheduledWorkId: occ.scheduled_work_id,
                    occurrenceId: occ.id,
                    orgId: occ.org_id,
                    handlerKey: occ.handler_key,
                    dueAt: occ.due_at,
                    attemptNumber,
                    workerId,
                    domainRef: occ.domain_ref ?? {},
                });
            } catch (err) {
                // A throwing handler fails ITS occurrence. The loop continues, so one
                // poisoned schedule cannot stop unrelated due work.
                outcome = {
                    kind: "retryable_failure",
                    reason: err instanceof Error ? err.message.slice(0, 300) : "handler threw",
                };
            }
        }

        const applied = await finalize(supabase, occ, claimToken, attemptNumber, outcome, now);
        if (attempt?.id) {
            await supabase
                .from("scheduled_work_attempts")
                .update({
                    finished_at: new Date().toISOString(),
                    outcome: outcome.kind,
                    diagnostic: { ...(outcome.diagnostic ?? {}), lease: applied, reason: outcome.reason ?? null },
                })
                .eq("id", attempt.id);
        }

        // A domain that computes its own cadence tells us here.
        if (outcome.kind === "completed" && outcome.nextDueAt !== undefined) {
            await supabase
                .from("scheduled_work")
                .update({ next_due_at: outcome.nextDueAt, updated_at: new Date().toISOString() })
                .eq("id", occ.scheduled_work_id);
        }

        if (applied === "applied") {
            if (outcome.kind === "completed") result.completed += 1;
            else if (outcome.kind === "retryable_failure" && attemptNumber < SCHEDULED_WORK_MAX_ATTEMPTS) {
                result.retryScheduled += 1;
            } else result.terminallyFailed += 1;
        }
        result.occurrences.push({ id: occ.id, handlerKey: occ.handler_key, outcome: outcome.kind });
    }

    return result;
}
