import { NextResponse } from "next/server";

/**
 * SCHEDULES, JOBS AND THE MONEY THEY POST — what a caller may do, never what they are called.
 *
 * Fourteen handlers asked `ctx.role !== "admin"`. Replacing that with one key per URL folder would
 * have been the obvious move and the wrong one, because four of the fourteen are not scheduling or
 * job operations at all. They post money:
 *
 *   schedules/[id]/post-customer-payment   a cash receipt
 *   schedules/[id]/post-vendor-payout      a cash out
 *   schedules/[id]/post-completion         a GL journal entry
 *   jobs/[id]/charges                      a receivable charge, posted immediately
 *
 * `scheduling.write` is labelled "Manage scheduling", and the migration that minted it defines
 * `billing.read` as a SEPARATE family in the same statement — the catalog's own vocabulary already
 * refuses to let scheduling mean money. So authority here follows the business consequence rather
 * than the URL folder, and the money four are owned by Financials even though they are served from
 * under `schedules/` and `jobs/`.
 *
 * ── WHY A NEW FINANCIALS KEY RATHER THAN AN EXISTING ONE ──
 *
 * `fin.write` ("Manage financials") is held by `admin` AND `ops` and is already enforced elsewhere,
 * so reusing it would hand `ops` four money operations it cannot reach today — and removing it from
 * `ops` to compensate would revoke authority ops genuinely exercises. `fin.adjust` is admin-only but
 * its own description scopes it to "a manual credit, waiver, write-off or correction that REDUCES
 * what a family owes"; a receipt, a payout and a journal entry are none of those. Neither is
 * truthful, so `fin.post` exists — bounded to posting, implying nothing else in Financials.
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
export const FIN_POST = "fin.post" as const;

export type SchedulingJobsCapability = typeof SCHEDULING_WRITE | typeof OPS_JOBS_WRITE | typeof FIN_POST;

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
 * `const denied = requireSchedulingJobsCapability(ctx, FIN_POST); if (denied) return denied;` — the
 * guard stays in front of the write and the capability is named at the point of use.
 */
export function requireSchedulingJobsCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: SchedulingJobsCapability,
): NextResponse | null {
    if (hasSchedulingJobsCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
