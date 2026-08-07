import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import {
    OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
    stripOpportunityDrawerRecordStaging,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { computeOpportunityDrawerViewModelGeneration } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelGeneration";
import { logOpportunityDrawerViewModelComposeShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/types";
import { resolveSharedCanonicalDeps } from "@/lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps";
import { buildInitialPanelResource } from "@/lib/adminV2/viewModel/drawer/opportunity/initialPanelResource";
import { buildDeferredDetailResource } from "@/lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource";

export type ComposeOpportunityDrawerViewModelParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    hintOperTrustHeadline?: string | null;
    hintOperTrustUrgency?: string | null;
    /**
     * Skip the family-communications preview compute during first-paint composition.
     * The preview is only an initial seed for the Activity mode embedded workspace, which
     * fetches on demand and is prewarmed on idle (`focusPanelActivityPrewarm`) — so on the
     * workspace inline Focus Panel path it never blocks first paint. Defaults to false so
     * any full-drawer caller keeps the seeded preview. The workspace VM route sets it true,
     * removing one server round-trip (`activity_comms_preview_ms`) from record-open.
     */
    deferCommunicationsPreview?: boolean;
    /**
     * Skip the stage-work projection (Current Work region) during first-paint composition and mark
     * `workspace.stage_work` pending. The workspace VM route sets this; the client resolves the
     * projection through the thin `…/stage-work` resource and patches the region in place. Defaults
     * to false so any full-drawer caller keeps stage work inline.
     */
    deferStageWork?: boolean;
};

export async function composeOpportunityDrawerViewModel(
    params: ComposeOpportunityDrawerViewModelParams
): Promise<OpportunityDrawerViewModelResult> {
    const composeStart = Date.now();
    const phases: Record<string, number> = {};
    const { supabase, gate, opportunityId } = params;
    const orgId = gate.orgId;

    const finishCompose = (result: OpportunityDrawerViewModelResult): OpportunityDrawerViewModelResult => {
        logOpportunityDrawerViewModelComposeShadowSummary(opportunityId, result, Date.now() - composeStart);
        return result;
    };

    // S4.2 — the shared canonical DATA foundation (Module C): opportunity record (visible payload +
    // household attach), layout inputs, work-unit identity + queue definition, department metadata +
    // status definitions, and the lifecycle rail. Resolved once; both tiers read it by value.
    const shared = await resolveSharedCanonicalDeps({
        supabase,
        gate,
        opportunityId,
        departmentId: params.departmentId,
        workUnitId: params.workUnitId,
    });
    if (!shared.ok) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: shared.reason,
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }
    const {
        record,
        workUnitId,
        departmentId,
        layoutConfigJson,
        layoutVersion,
        queueDefinitionRaw,
        queueDefinition,
        wuMetadata,
        deptMetadata,
        statusDefs,
        statusKey,
        lifecycle_rail,
        currentStageKey,
        currentStageLabel,
    } = shared;
    Object.assign(phases, shared.phases_ms);

    // S4.4 — the Tier-2 Initial Panel composition (Module A): readiness, first-paint deps, above-fold
    // render model, first-paint contract, header, registry actions, and Tier-2 summaries. Mutates the
    // shared record in place (first-paint patches) BEFORE B; the orchestrator snapshots above_fold.record
    // ONCE, after B's patches. Imports no Tier-3.
    const initial = await buildInitialPanelResource({
        supabase,
        gate,
        opportunityId,
        departmentId,
        workUnitId: workUnitId || null,
        statusKey,
        record,
        deptMetadata,
        layoutConfigJson,
        queueDefinition,
        wuMetadata,
        statusDefs,
        lifecycleRail: lifecycle_rail,
        hintOperTrustHeadline: params.hintOperTrustHeadline,
        hintOperTrustUrgency: params.hintOperTrustUrgency,
    });
    if (!initial.ok) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: initial.reason,
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }
    Object.assign(phases, initial.phases_ms);

    // S4.3 — the deep/deferred (Tier-3) composition (Module B): stage context, family comms preview, and
    // the heavy stage-work slice. Resolved independently of the visible primary panel; the workspace VM
    // route defers comms + stage-work off the record-open path.
    const deferStageWork = params.deferStageWork === true;
    const deferred = await buildDeferredDetailResource({
        supabase,
        orgId,
        opportunityId,
        viewerUserId: gate.userId,
        departmentId,
        deptMetadata,
        currentStageKey,
        currentStageLabel,
        deferCommunicationsPreview: params.deferCommunicationsPreview === true,
        deferStageWork,
    });
    Object.assign(phases, deferred.phases_ms);
    const {
        stage_context,
        work_intent_runtime,
        stage_work_runtime,
        published_stage_inputs,
        stage_work: stage_work_state,
    } = deferred.workspace_detail;
    // Activity → Work Items must show the same open stage-work rows as global Work Items
    // (e.g. Contact Family) — do not strip operating-plan work from the inquiry preview.
    const tasksSummary = initial.summaries.tasks_raw;
    record._inquiry_summary_tasks = tasksSummary;
    if (record._overview_data && typeof record._overview_data === "object" && !Array.isArray(record._overview_data)) {
        (record._overview_data as Record<string, unknown>)._inquiry_summary_tasks = tasksSummary;
    }
    Object.assign(record, deferred.record_patches);

    const tSerialize0 = Date.now();

    const viewModel: OpportunityDrawerViewModel = {
        generation: computeOpportunityDrawerViewModelGeneration({
            orgId,
            opportunityId,
            departmentId,
            workUnitId: workUnitId || null,
            statusKey,
            layoutVersion,
            headerActionKeys: initial.actions.header.map((a) => a.key),
            aboveFoldSectionKeys: initial.aboveFoldRenderModel.sections.map((s) => s.section_key),
        }),
        structureSettled: true,
        compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "opportunity", id: opportunityId },
        workspace: {
            department_id: departmentId,
            work_unit_id: workUnitId || null,
            /** Raw work-unit JSON (v1/v2) — client lifecycle parser re-coerces via resolveWorkUnitQueueDefinitionForDrawer. */
            queue_definition: queueDefinitionRaw,
            lifecycle_rail,
            stage_context,
            work_intent_runtime,
            stage_work_runtime,
            published_stage_inputs,
            stage_work: stage_work_state,
        },
        first_paint: initial.first_paint,
        header: initial.header,
        actions: initial.actions,
        layout: initial.layout,
        activity: deferred.activity,
        above_fold: {
            render_model: initial.aboveFoldRenderModel,
            record: stripOpportunityDrawerRecordStaging(record),
        },
        summaries: {
            tasks: tasksSummary,
            active_tour_bookings: initial.summaries.active_tour_bookings,
            reminders: initial.summaries.reminders,
            bos: initial.summaries.bos,
            attention: initial.summaries.attention,
        },
        background_refresh: {
            allowed: deferStageWork
                ? ["task_status", "scheduled_send_status", "readiness_values", "stage_work"]
                : ["task_status", "scheduled_send_status", "readiness_values"],
        },
        timing: {
            compose_ms: Date.now() - composeStart,
            phases_ms: phases,
        },
    };

    // `phases` is referenced by viewModel.timing.phases_ms — these post-literal writes still surface.
    phases.serialization_ms = Date.now() - tSerialize0;
    phases.total_ms = Date.now() - composeStart;
    return finishCompose({ ok: true, viewModel });
}
