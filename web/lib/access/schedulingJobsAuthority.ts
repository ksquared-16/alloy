import { NextResponse } from "next/server";

/**
 * SCHEDULES AND JOBS — what a caller may do, never what they are called.
 *
 * Fourteen handlers asked `ctx.role !== "admin"`. Replacing that with one key per URL folder would
 * have been the obvious move and the wrong one, because authority follows the business consequence
 * rather than the URL folder.
 *
 * ── WHY `fin.post` IS GONE (Payments V1 · W6-A) ──
 *
 * Four of those fourteen posted money rather than scheduling anything —
 * `schedules/[id]/post-customer-payment`, `post-vendor-payout`, `post-completion` and
 * `jobs/[id]/charges` — and `fin.post` was minted for exactly them, bounded to posting so it
 * implied nothing else in Financials. That was a correct decision, not accidental fragmentation.
 *
 * Canonical Payments then took the capability over: money is recorded through a registered action
 * (`payment.record`, `payment.collect_card`, `payment.apply_to_charge`) under `fin.write` /
 * `fin.adjust` / `fin.provider`, and provider execution runs through a collection attempt and its
 * adapter. All four handlers were development-era duplicates of that, each with zero fetch callers,
 * so W6-A deleted them — and `fin.post` with them, because a permission no route enforces is
 * "a control that changes nothing".
 *
 * ── WHAT SURVIVES, AND WHY THIS MODULE DID NOT GO WITH IT ──
 *
 * `requireSchedulingJobsCapability` is NOT dead and must not be deleted alongside `fin.post`:
 * `scheduling.write` and `ops.jobs.write` are enforced here by a dozen live routes — schedules,
 * jobs, assignments, discounts. Removing the helper would strip their authority and re-open the
 * role-title gate this module exists to have closed.
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
