/**
 * WORK — defining the work, and doing it.
 *
 * Five mutations ran the organization's operational work with no functional authority. Four were
 * reachable through PORTAL ADMISSION ALONE — `requireAdminOrOps()` resolves admission and no role —
 * and one asked the `admin` role title. So who could complete a family's stage work, close a case,
 * record a participant decision or fire an automation was decided by who could reach the portal.
 *
 * ── THE SPLIT ──
 *
 * `work.configure`  defines what operational work EXISTS: the queue definition that writes
 *                   `work_units`. Administrative.
 *
 * `work.operate`    performs work inside a process ALREADY RUNNING: completing stage work, closing
 *                   a family, recording a participant decision, running an approved automation.
 *                   The front desk's day.
 *
 * Neither implies the other, and the package follows: admin holds both, ops holds only
 * `work.operate` — the same operational shape ops is already seeded (`processing.operate`,
 * `attendance.record`, `forms.submissions.confirm`, `communications.assign`).
 *
 * ── FOUR THINGS THIS IS NOT ──
 *
 * NOT `work.assign`, which does not exist and must not. Assignment stays PER PRODUCT SURFACE under
 * the promoted Assignments ruling: conversation assignment is `communications.assign`, vendor
 * assignment is `ops.jobs.write`, assignment-type vocabulary is `configuration.vocabulary.manage`.
 *
 * NOT Business Process. Lifecycle Builder V1 established that completing stage work is neither
 * `business_process.configure` nor `.activate`: those change what a process WOULD do, or which
 * configuration is live; these change what the process DID for one family.
 *
 * NOT Workflow definition. `ops.workflows.write` decides WHAT an automation is configured to do.
 * Running one is a different power, and the two are deliberately held apart: a Workflow Writer
 * cannot fire their automation from that key alone, and a Work Operator cannot edit it.
 *
 * NOT AI. `ai.enrichment.use` is the authority to use a model, not to advance a family's case.
 *
 * ── WHY RUNNING AN AUTOMATION IS `work.operate` AND NOT A SUPER-CAPABILITY ──
 *
 * `executeWorkflowRun` writes across six product domains, so the question was whether running one
 * lets an operator choose arbitrary targets. It does not, now: the workflow's ACTIONS are authored
 * by an `ops.workflows.write` holder, and the operator supplies only the triggering event — which
 * the run route pins to the caller's own organization and validates every record it names. Before
 * that repair the runtime read `payload.org_id` straight into vendor resolution and hydrated
 * `payload.job.id` with an id-only query, which would have made this key exactly the super-capability
 * the model forbids.
 */
import { NextResponse } from "next/server";

/** Defining what operational work exists. */
export const WORK_CONFIGURE = "work.configure" as const;

/** Performing and advancing work inside a running process. */
export const WORK_OPERATE = "work.operate" as const;

export type WorkCapability = typeof WORK_CONFIGURE | typeof WORK_OPERATE;

/** The closed set. A lock reads this to prove no third Work key appeared. */
export const WORK_CAPABILITIES = [WORK_CONFIGURE, WORK_OPERATE] as const;

/** Pure: does this resolved context carry the Work authority named? */
export function hasWorkCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: WorkCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * Refuse unless the caller holds this Work authority, naming the key so a denial is debuggable.
 *
 * No role title and no environment flag: admitted by grant or not at all, identically everywhere.
 */
export function requireWorkCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: WorkCapability,
): NextResponse | null {
    if (hasWorkCapability(ctx, capability)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: capability },
        { status: 403 },
    );
}
