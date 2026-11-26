/**
 * WORKFLOW CONFIGURATION — capability authority for Workflow definitions and their actions.
 *
 * `ops.workflows.write` was catalogued in Phase 0, granted through explicit packages, and enforced
 * by NOTHING until AI + Agent Authority V2 activated it for `ai/workflow-assist/apply` — the route
 * that commits a Workflow Assist proposal into `workflows` and `workflow_actions`. That established
 * its semantic contract by use: **mutate Workflow definitions and their actions**.
 *
 * This module extends the same authority to the five handlers that perform those mutations
 * directly, and nothing else. Each writes `workflows`, `workflow_actions` or `workflow_conditions`,
 * and each was gated on `requireAdmin()` — a ROLE TITLE (`auth.role !== "admin"`), which admitted an
 * admin whose package withholds the key and refused a custom Workflow Writer who holds it.
 *
 * ── WHAT THIS AUTHORITY IS NOT ──
 *
 * NOT EXECUTION. `POST /api/admin/workflows/[id]/run` calls `executeWorkflowRun`, which is a
 * cross-domain mutation engine: it inserts and updates `assignments`, `contacts`, `vendors`,
 * `schedules`, `messages`, `jobs`, `workflow_runs` and `workflow_action_runs`. Running a workflow
 * does not change what a workflow IS, and the authority to author automation is not the authority
 * to fire it across six product domains that each have their own owner. It is deliberately NOT
 * given this key, and is recorded as WORK_AUTHORITY_MODEL_DEBT.
 *
 * NOT BUSINESS PROCESS. Nothing here writes a process definition, a stage, or a lifecycle.
 * `business_process.configure` owns those, and the two models interact without being equivalent.
 *
 * NOT AI. `ai/workflow-assist/propose` generates a proposal and is owned by the AI model, with its
 * own documented admin-only product rule. Proposing and committing are different powers, and the
 * promoted AI + Agent V2 boundary keeps `ai.enrichment.use` off the apply path.
 *
 * READS ARE DELIBERATELY NOT GATED. `ops.workflows.read` remains dormant, and activating it merely
 * to make the pair symmetrical would invent a read boundary the product does not currently have.
 */
import { NextResponse } from "next/server";

/** Mutating Workflow definitions, their actions and their conditions. */
export const OPS_WORKFLOWS_WRITE = "ops.workflows.write" as const;

/** Pure: does this resolved context carry Workflow configuration authority? */
export function hasWorkflowConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): boolean {
    return (ctx.permissionKeys ?? []).includes(OPS_WORKFLOWS_WRITE);
}

/**
 * Refuse unless the caller may configure Workflows, naming the key so a denial is debuggable.
 *
 * No role title and no environment flag: a principal is admitted by grant or not at all, and
 * identically in every deployment.
 */
export function requireWorkflowConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): NextResponse | null {
    if (hasWorkflowConfigurationCapability(ctx)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: OPS_WORKFLOWS_WRITE },
        { status: 403 },
    );
}
