/**
 * CP-1 / S4.3 — Deferred Detail resource (Module B, Tier-3).
 *
 * Deep/deferred composition that is NOT required for the primary panel to be usable: the stage operating
 * plan purpose, the family communications preview (Activity-mode seed), and the heavy stage-work slice
 * (Current Work runtime). Resolved independently of the Initial-Panel (Tier-2) work and off the primary
 * critical path (the workspace VM route defers comms + stage-work). Behavior is identical to the inline
 * block it replaced in `composeOpportunityDrawerViewModel`.
 *
 * The orchestrator applies this module's `record_patches` and owns the residual-tasks filter (which needs
 * `stage_work_runtime`) — this module imports NOTHING from the Initial-Panel resource.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveStageOperatingPlanPurpose } from "@/lib/lifecycle/resolveStageOperatingPlanPurpose";
import { resolveOpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import { resolveFamilyCommunicationWorkspacePreview } from "@/lib/communications/v2/familyWorkspace";
import type { StageWorkLoadState } from "@/lib/adminV2/viewModel/drawer/types";
import type { DeferredDetailResource } from "@/lib/adminV2/viewModel/drawer/opportunity/drawerVmComposition.types";

export type BuildDeferredDetailResourceParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    viewerUserId: string;
    departmentId: string | null;
    deptMetadata: Record<string, unknown> | null;
    currentStageKey: string | null;
    currentStageLabel: string | null;
    deferCommunicationsPreview: boolean;
    deferStageWork: boolean;
};

/** Resolve the deep/deferred (Tier-3) composition for the opportunity drawer VM. */
export async function buildDeferredDetailResource(
    params: BuildDeferredDetailResourceParams
): Promise<DeferredDetailResource> {
    const {
        supabase,
        orgId,
        opportunityId,
        viewerUserId,
        departmentId,
        deptMetadata,
        currentStageKey,
        currentStageLabel,
        deferCommunicationsPreview,
        deferStageWork,
    } = params;
    const phases_ms: Record<string, number> = {};

    const stage_context = resolveStageOperatingPlanPurpose({
        departmentMetadata: deptMetadata,
        builderStageKey: currentStageKey,
    });

    // The communications preview is a first-paint seed only; the Activity embedded workspace fetches it on
    // demand (and prewarms on idle). Deferring it drops one server round-trip from the record-open path.
    const communicationsPreviewP = deferCommunicationsPreview
        ? Promise.resolve(null)
        : (async () => {
              const tCommsPreview0 = Date.now();
              const preview = await resolveFamilyCommunicationWorkspacePreview(supabase, orgId, {
                  entityType: "opportunities",
                  entityId: opportunityId,
                  focusOpportunityId: opportunityId,
                  composerChannel: "email",
                  viewerUserId,
                  familyStageLabel: currentStageLabel,
              });
              phases_ms.activity_comms_preview_ms = Date.now() - tCommsPreview0;
              return preview;
          })();

    // Stage work (Current Work region) is heavy — two operational_tasks reads — and does NOT feed the
    // above-fold render model. On the workspace inline Focus Panel path it is deferred to a thin canonical
    // resource resolved after first paint; the VM carries a `pending` load state (neutral loading, never a
    // false "No active work").
    const [stageSlice, communicationsPreviewVm] = await Promise.all([
        deferStageWork
            ? Promise.resolve({
                  stage_work_runtime: null,
                  published_stage_inputs: null,
                  work_intent_runtime: null,
              })
            : resolveOpportunityStageWorkSlice({
                  supabase,
                  orgId,
                  opportunityId,
                  departmentId,
                  stageKey: currentStageKey,
                  stageLabel: currentStageLabel,
                  departmentMetadata: deptMetadata,
              }),
        communicationsPreviewP,
    ]);
    const { stage_work_runtime, published_stage_inputs, work_intent_runtime } = stageSlice;
    const stage_work: StageWorkLoadState = deferStageWork
        ? { status: "pending" }
        : stage_work_runtime
          ? { status: "ready", value: stage_work_runtime }
          : { status: "empty" };

    return {
        workspace_detail: {
            stage_context,
            work_intent_runtime,
            stage_work_runtime,
            published_stage_inputs,
            stage_work,
        },
        activity: { communicationsPreviewVm },
        // Scheduling projection currently resolves inside the first-paint dependency batch (a Tier-3 leak
        // into the Tier-2 resolver); it moves here in a later slice (S4.4/S4.5). Null for now.
        scheduling_projection: null,
        record_patches: {
            _stage_work_runtime: stage_work_runtime,
            _work_intent_runtime: work_intent_runtime,
        },
        phases_ms,
    };
}
