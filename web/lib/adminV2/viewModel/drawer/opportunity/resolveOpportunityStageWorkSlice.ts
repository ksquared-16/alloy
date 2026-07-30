/**
 * Thin stage-work (Current Work region) slice for the opportunity Focus Panel.
 *
 * This is the deferred Tier-2 of the selected-record view model. It is NOT a second record
 * composition: it resolves ONLY the stage-work projection the visible Current Work region needs,
 * keyed by the already-resolved identity ({opportunityId, departmentId, stageKey}) the Tier-1 VM
 * carries. It re-fetches nothing from Tier 1 — one cached department-metadata read plus the two
 * `operational_tasks` reads inside `projectStageWorkRuntime`.
 *
 * Used by:
 *  - `composeOpportunityDrawerViewModel` (inline, non-deferred path — deptMetadata preloaded);
 *  - the `…/[id]/stage-work` route (deferred path — deptMetadata fetched here).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchDepartmentMetadataForActivity } from "@/lib/admin/loadOpportunityActivitySignal";
import {
    projectStageWorkRuntime,
    primaryWorkIntentProjectionFromStageWork,
} from "@/lib/lifecycle/projectStageWorkRuntime";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

export type OpportunityStageWorkSlice = {
    stage_work_runtime: StageWorkRuntimeProjection | null;
    published_stage_inputs: PublishedStageInputsForCurrentWork | null;
    work_intent_runtime: WorkIntentRuntimeProjection | null;
};

export type ResolveOpportunityStageWorkSliceParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentId: string | null;
    /** Builder stage_key (= `workspace.lifecycle_rail.current_stage_key`). Null → no active stage. */
    stageKey: string | null;
    stageLabel?: string | null;
    /** Preloaded department metadata (Tier-1 already has it). When omitted it is fetched (cached). */
    departmentMetadata?: unknown;
    /** Child-grain subject — threaded into Current Work execution; never inferred as family. */
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    processInstanceId?: string | null;
};

const EMPTY_SLICE: OpportunityStageWorkSlice = {
    stage_work_runtime: null,
    published_stage_inputs: null,
    work_intent_runtime: null,
};

export async function resolveOpportunityStageWorkSlice(
    params: ResolveOpportunityStageWorkSliceParams,
): Promise<OpportunityStageWorkSlice> {
    const stageKey = params.stageKey?.trim() || null;
    if (!stageKey) return EMPTY_SLICE;

    const departmentMetadata =
        params.departmentMetadata !== undefined
            ? params.departmentMetadata
            : await fetchDepartmentMetadataForActivity(params.supabase, params.orgId, params.departmentId);

    const stage_work_runtime = await projectStageWorkRuntime({
        supabase: params.supabase,
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        departmentId: params.departmentId,
        departmentMetadata,
        builderStageKey: stageKey,
        stageLabel: params.stageLabel ?? null,
        customerMemberId: params.customerMemberId,
        opportunityCustomerMemberId: params.opportunityCustomerMemberId,
        processInstanceId: params.processInstanceId,
    });

    const published_stage_inputs = resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: departmentMetadata as Record<string, unknown> | null,
        builderStageKey: stageKey,
    });

    return {
        stage_work_runtime,
        published_stage_inputs,
        work_intent_runtime: primaryWorkIntentProjectionFromStageWork(stage_work_runtime),
    };
}
