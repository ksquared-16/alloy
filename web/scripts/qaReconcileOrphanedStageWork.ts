#!/usr/bin/env npx tsx
/**
 * QA-only: cancel orphaned BP stage-work tasks and spawn current primary template.
 *
 * Env:
 *   OPPORTUNITY_IDS=id1,id2   (required unless passed as args)
 *   DRY_RUN=1                 (default — report only)
 *   QA_RECONCILE_APPLY=1      (required with DRY_RUN unset to mutate)
 *
 * Run from `web/`:
 *   OPPORTUNITY_IDS=c78a8e14-... npm run dev:qa:reconcile-orphaned-stage-work
 *   OPPORTUNITY_IDS=c78a8e14-... QA_RECONCILE_APPLY=1 DRY_RUN=0 npm run dev:qa:reconcile-orphaned-stage-work
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    reconcileOrphanedStageWorkForOpportunity,
    type ReconcileOrphanedStageWorkReport,
} from "@/lib/lifecycle/reconcileOrphanedStageWorkForOpportunity";
import { projectStageWorkRuntime } from "@/lib/lifecycle/projectStageWorkRuntime";
import { fetchEffectiveStatusDefinitionsDirect } from "@/lib/admin/statusDefinitionsResolve";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function parseIds(): string[] {
    const fromEnv = (process.env.OPPORTUNITY_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const fromArgs = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
    return [...new Set([...fromEnv, ...fromArgs])];
}

async function verifyCurrentWork(opportunityId: string, orgId: string) {
    const supabase = createAdminClient();
    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase,
        orgId,
        opportunityId,
    });
    let departmentMetadata: Record<string, unknown> = {};
    if (departmentId) {
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (dept?.metadata && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)) {
            departmentMetadata = dept.metadata as Record<string, unknown>;
        }
    }

    const { data: opp } = await supabase
        .from("opportunities")
        .select("status_key, title")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();

    const statusDefs = await fetchEffectiveStatusDefinitionsDirect(supabase, orgId, "opportunities");
    const lifecycleRail = buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata,
        statusKey: String(opp?.status_key ?? ""),
        statusDefs,
        workUnitMetadata: null,
    });

    const stage_work_runtime = await projectStageWorkRuntime({
        supabase,
        orgId,
        opportunityId,
        departmentId,
        departmentMetadata,
        builderStageKey: lifecycleRail?.current_stage_key ?? null,
        stageLabel: null,
    });

    const context = buildOperationalContext({
        subjectId: opportunityId,
        title: String(opp?.title ?? "Record"),
        subjectVm: {
            entity: { type: "opportunity", id: opportunityId },
            workspace: {
                department_id: departmentId,
                work_unit_id: null,
                queue_definition: null,
                lifecycle_rail: lifecycleRail,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime,
            },
            summaries: {
                tasks: { state: "loaded", open_count: 0, open_tasks: [] },
                attention: { needs_attention: false, primary_reason: null, reason_count: 0 },
                reminders: { scheduled_send_count: 0, next_follow_up_iso: null, scheduled_sends: [] },
                active_tour_bookings: [],
            },
            actions: { header_menu: [] },
            above_fold: { record: { id: opportunityId } },
        } as never,
        truth: { id: opportunityId },
        perspective: null,
        statusLabel: lifecycleRail?.current_stage_key ?? null,
        canMutate: true,
    });

    const cw = projectCurrentWork(context);
    const actionable = cw.primaryWorkItem;
    const completionReady =
        actionable
        && stage_work_runtime
        && actionable.state === "open"
        && actionable.work_id
        ? workIntentProjectionForStageWorkItem(stage_work_runtime, actionable)
        : null;

    return {
        title: cw.title,
        showOutcomeCompletion: cw.showOutcomeCompletion,
        completionOutcomes: cw.completionOutcomes.map((o) => o.outcome_key),
        primary_state: actionable?.state ?? null,
        primary_work_id: actionable?.work_id ?? null,
        completion_projection_ready: Boolean(
            completionReady?.work_id && (completionReady.outcomes?.length ?? 0) > 0,
        ),
    };
}

async function main() {
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run QA orphan reconciliation in production");
        process.exit(1);
    }

    const ids = parseIds();
    if (!ids.length) {
        console.error("OPPORTUNITY_IDS or CLI args required");
        process.exit(1);
    }

    const dryRun = process.env.DRY_RUN !== "0" && process.env.QA_RECONCILE_APPLY !== "1";
    if (!dryRun && process.env.QA_RECONCILE_APPLY !== "1") {
        console.error("Set QA_RECONCILE_APPLY=1 and DRY_RUN=0 to apply changes");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const reports: ReconcileOrphanedStageWorkReport[] = [];

    for (const opportunityId of ids) {
        const report = await reconcileOrphanedStageWorkForOpportunity({
            supabase,
            opportunityId,
            dryRun,
        });
        reports.push(report);

        if (!dryRun && report.org_id) {
            const verification = await verifyCurrentWork(opportunityId, report.org_id);
            console.log(
                JSON.stringify(
                    { phase: "verify_current_work", opportunity_id: opportunityId, verification },
                    null,
                    2,
                ),
            );
        }
    }

    console.log(
        JSON.stringify(
            {
                dry_run: dryRun,
                reports,
                hint: dryRun
                    ? "Re-run with QA_RECONCILE_APPLY=1 DRY_RUN=0 to apply"
                    : "Reload record in browser — Contact Family should be open with outcomes",
            },
            null,
            2,
        ),
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
