import { NextResponse } from "next/server";

/**
 * SCHEDULES AND JOBS — what a caller may do, never what they are called.
 *
 * Fourteen handlers asked `ctx.role !== "admin"`. Replacing that with one key per URL folder would
 * have been the obvious move and the wrong one, because authority follows the business consequence
 * rather than the URL folder.
 *
 * ── THE MONEY FOUR, AND WHY `fin.post` IS GONE (Payments V1 · W6-A2) ──
 *
 * Four of the fourteen posted money rather than scheduling anything — a cash receipt, a cash out, a
 * GL journal entry and an immediately-posted receivable charge — served from under `schedules/` and
 * `jobs/`. `fin.post` was minted for exactly them: `fin.write` is held by ops as well as admin, so
 * reusing it would have handed ops four money operations it could not reach, and `fin.adjust` is
 * scoped by its own description to corrections that REDUCE what a family owes. Neither was truthful,
 * so a bounded posting key existed. That was a correct decision, not accidental fragmentation.
 *
 * All four are now deleted. Three had no caller anywhere; the fourth, `jobs/[id]/charges`, was
 * reached only by `JobManualChargeForm`, which had no importer and was never rendered, so it went
 * with the route. Canonical Payments owns these capabilities: a registered action, then a
 * collection attempt, then the provider adapter, then canonical posting, then the Payment, then the
 * allocation — and no route writes money at all.
 *
 * So `fin.post` is retired, because a permission no route enforces is, in this catalog's own words,
 * "a control that changes nothing". W6-A1 deferred that retirement deliberately: it requires
 * re-deriving pinned access-governance truth, which did not belong in a candidate about deleting
 * routes.
 *
 * ── WHAT SURVIVES, AND WHY THIS MODULE DID NOT GO WITH IT ──
 *
 * `requireSchedulingJobsCapability` is NOT dead. Fifteen live routes enforce `scheduling.write` and
 * `ops.jobs.write` through it — schedules, jobs, assignments, discounts. Deleting the helper
 * alongside `fin.post` would strip their authority and re-open the role-title gate this module
 * exists to have closed.
 *
 * ── THE TWO REUSED KEYS WERE ALREADY IN THE CATALOG, AND DEAD ──
 *
 * `scheduling.write` and `ops.jobs.write` were catalogued long ago, granted to admin and ops, and
 * enforced NOWHERE: their only executable reference was the unenforced-permission list, whose own
 * header calls such keys "a control that changes nothing". Enforcing them here is what makes them
 * real — and it is also why the ops default grant has to be corrected in the same slice, or the
 * cleanup would hand ops ten operations that the role-title gate denied it a moment earlier.
 */
export const SCHEDULING_WRITE = "scheduling.write" as const;
export const OPS_JOBS_WRITE = "ops.jobs.write" as const;

export type SchedulingJobsCapability = typeof SCHEDULING_WRITE | typeof OPS_JOBS_WRITE;

/** True when the caller's effective capabilities carry this authority. */
export function hasSchedulingJobsCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: SchedulingJobsCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * The refusal for an operation the caller has no capability for.
 *
 * Returns `null` when authorized, so a handler reads as
 * `const denied = requireSchedulingJobsCapability(ctx, SCHEDULING_WRITE); if (denied) return denied;`
 * — the guard stays in front of the write and the capability is named at the point of use.
 */
export function requireSchedulingJobsCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: SchedulingJobsCapability,
): NextResponse | null {
    if (hasSchedulingJobsCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
