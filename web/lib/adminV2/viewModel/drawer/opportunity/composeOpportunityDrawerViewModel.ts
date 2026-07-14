import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { fetchDepartmentMetadataForActivity } from "@/lib/admin/loadOpportunityActivitySignal";
import {
    attachOpportunityHouseholdCustomerPersonsForDrawer,
    buildOpportunityDrawerVisiblePayload,
} from "@/lib/admin/opportunityEntityRecord";
import { resolveWorkUnitQueueDefinitionForDrawer } from "@/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer";
import { sanitizeDrawerOperTrustPreviewFromHints } from "@/lib/admin/sanitizeDrawerOperTrustPreview";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { OPPORTUNITY_CANONICAL_ADMIN_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";
import { createReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import { tryEvaluateDrawerRecordReadiness } from "@/lib/completion/readinessDrawerBootstrap";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import {
    buildOpportunityDrawerViewModelAboveFold,
    compileOpportunityDrawerViewModelShell,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import {
    buildOpportunityDrawerHeaderSubtitle,
    buildOpportunityDrawerHeaderTitle,
    buildOpportunityStatusControlVm,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { resolveStageOperatingPlanPurpose } from "@/lib/lifecycle/resolveStageOperatingPlanPurpose";
import { resolveOpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import { resolveOpportunityDrawerStatusCanMutateFromGate } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate";
import {
    buildOpportunityDrawerAttentionSummary,
    buildOpportunityDrawerBosSummary,
    parseInquirySummaryTasksFromRecord,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelSummaries";
import {
    buildOpportunityFirstViewportPlan,
    resolveTourSlotDisplaySource,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";
import {
    aboveFoldSectionsStructureSettled,
    OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
    stripOpportunityDrawerRecordStaging,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { computeOpportunityDrawerViewModelGeneration } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelGeneration";
import {
    buildOpportunityDrawerFirstPaintContract,
    opportunityDrawerFirstPaintContractValid,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";
import {
    headerActionsFromFirstPaintData,
    remindersFromFirstPaintData,
    resolveOpportunityDrawerFirstPaintDependencies,
    tourBookingsFromFirstPaintData,
} from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies";
import { resolveFamilyCommunicationWorkspacePreview } from "@/lib/communications/v2/familyWorkspace";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { logOpportunityDrawerViewModelComposeShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelResult,
    RemindersSummaryVm,
    StageWorkLoadState,
} from "@/lib/adminV2/viewModel/drawer/types";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function layoutFromEffective(
    effective: Awaited<ReturnType<typeof fetchEffectiveRecordDrawerLayout>>
): {
    config_json: RecordLayoutConfigJson;
    inquiry_drawer_mode: "workflow_v1" | "classic";
    layout_version: string;
} | null {
    if (!effective.ok || !effective.layout) return null;
    const cfg = (effective.layout.config_json ?? {}) as RecordLayoutConfigJson;
    const mode = cfg.inquiry_drawer_mode === "workflow_v1" ? "workflow_v1" : "classic";
    return {
        config_json: cfg,
        inquiry_drawer_mode: mode,
        layout_version: effective.layout.key,
    };
}

function taskAssistEnabledOnServer(): boolean {
    const v = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1";
}

function queueDefinitionFromWorkUnit(
    wu: { queue_definition?: unknown } | null | undefined
): QueueDefinitionV1 | null {
    return resolveWorkUnitQueueDefinitionForDrawer(wu?.queue_definition);
}

const EMPTY_REMINDERS: RemindersSummaryVm = {
    state: "empty",
    next_follow_up_iso: null,
    scheduled_send_count: 0,
    scheduled_sends: [],
};

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

    const tOpp0 = Date.now();
    const { data: oppRow, error: oppErr } = await supabase
        .from("opportunities")
        .select(OPPORTUNITY_CANONICAL_ADMIN_SELECT)
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .single();
    phases.opportunity_select_ms = Date.now() - tOpp0;

    if (oppErr || !oppRow) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "opportunity_not_found",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }

    const ctxDept = trimOrNull(params.departmentId);
    const ctxWu = trimOrNull(params.workUnitId);
    const rowWu = trimOrNull((oppRow as { work_unit_id?: unknown }).work_unit_id);
    const workUnitId = ctxWu || rowWu;
    const tLayout0 = Date.now();
    const layoutP = fetchEffectiveRecordDrawerLayout(supabase, orgId, "opportunity");
    const wuP =
        workUnitId ?
            supabase
                .from("work_units")
                .select("id, department_id, metadata, queue_definition")
                .eq("id", workUnitId)
                .eq("org_id", orgId)
                .maybeSingle()
        :   Promise.resolve({ data: null, error: null });

    const [layoutRes, wuRes] = await Promise.all([layoutP, wuP]);
    phases.record_layout_ms = Date.now() - tLayout0;

    const layoutParsed = layoutFromEffective(layoutRes);
    if (!layoutParsed || layoutParsed.inquiry_drawer_mode !== "workflow_v1") {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: layoutParsed ? "classic_layout_deferred" : "layout_unavailable",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }

    const tVisible0 = Date.now();
    const record = await buildOpportunityDrawerVisiblePayload(
        supabase,
        orgId,
        oppRow as Record<string, unknown>,
        { hintDepartmentId: ctxDept }
    );
    phases.visible_entity_ms = Date.now() - tVisible0;

    await attachOpportunityHouseholdCustomerPersonsForDrawer(supabase, orgId, record);

    const wuData = wuRes.data as {
        id?: string;
        department_id?: string | null;
        metadata?: unknown;
        queue_definition?: unknown;
    } | null;
    const departmentId =
        ctxDept ||
        trimOrNull(wuData?.department_id) ||
        trimOrNull(record._work_unit_department_id as string | null);
    const queueDefinition = queueDefinitionFromWorkUnit(wuData);

    const tPrep0 = Date.now();
    const [deptMetadata, statusDefsPack] = await Promise.all([
        departmentId ?
            fetchDepartmentMetadataForActivity(supabase, orgId, departmentId)
        :   Promise.resolve(null),
        fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "opportunities", {
            activeOnly: true,
        }),
    ]);
    phases.status_and_dept_ms = Date.now() - tPrep0;

    const statusDefs = statusDefsPack.rows;
    const statusKey =
        record.status_key != null ? String(record.status_key).trim() : null;

    const readinessMemo = createReadinessMemoScope();
    const readiness = tryEvaluateDrawerRecordReadiness({
        orgId,
        opportunityId,
        entity: record,
        departmentId,
        workUnitId: workUnitId || null,
        departmentMetadata: deptMetadata as Record<string, unknown> | null,
        memoScope: readinessMemo,
    });

    record._record_surface = "full";

    const shell = compileOpportunityDrawerViewModelShell({
        layoutConfig: layoutParsed.config_json,
        record,
    });
    if (!shell) {
        return finishCompose({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "layout_unavailable",
                compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
            },
        });
    }

    const task_assist_enabled = taskAssistEnabledOnServer();
    const firstViewportPlan = buildOpportunityFirstViewportPlan({
        shell,
        task_assist_enabled,
        queue_definition_present: queueDefinition != null,
    });

    const tDeps0 = Date.now();
    const resolved = await resolveOpportunityDrawerFirstPaintDependencies({
        supabase,
        gate,
        opportunityId,
        departmentId,
        workUnitId: workUnitId || null,
        statusKey,
        record,
        dependencies: firstViewportPlan.dependencies,
        queueDefinition,
        statusDefs,
        wuMetadata: wuData?.metadata ?? null,
        departmentMetadata: deptMetadata as Record<string, unknown> | null,
        readiness: readiness ?? null,
    });
    Object.assign(record, resolved.record_patches);
    Object.assign(phases, resolved.phases_ms);
    phases.first_paint_resolve_ms = Date.now() - tDeps0;

    const reminders = remindersFromFirstPaintData(resolved.data) ?? EMPTY_REMINDERS;
    const resolvedActions = headerActionsFromFirstPaintData(resolved.data);
    const tourDisplaySource = resolveTourSlotDisplaySource(
        record,
        tourBookingsFromFirstPaintData(resolved.data)
    );

    const aboveFoldRenderModel = buildOpportunityDrawerViewModelAboveFold({
        shell,
        record,
        reminders,
        task_assist_enabled,
        tour_display_source: tourDisplaySource,
    });

    if (!aboveFoldSectionsStructureSettled(aboveFoldRenderModel.sections)) {
        throw new Error("drawer_vm_above_fold_not_structure_settled");
    }

    const first_paint = buildOpportunityDrawerFirstPaintContract({
        viewport_slots: firstViewportPlan.viewport_slots,
        dependencies: resolved.dependencies,
        data: resolved.data,
        deferred: [],
        background: [],
    });

    if (!first_paint.settled) {
        throw new Error("drawer_vm_first_paint_not_settled");
    }

    const headerActions = resolvedActions?.header ?? [];
    const activeTourBookings = tourBookingsFromFirstPaintData(resolved.data);
    const headerMenuActions = buildOpportunityDrawerHeaderMenuActions(
        resolvedActions,
        activeTourBookings.length > 0
    );
    const tabs = shell.tabs;
    const default_tab: DrawerTabKey = tabs.includes("overview") ? "overview" : (tabs[0] ?? "overview");

    const oper_trust_preview = sanitizeDrawerOperTrustPreviewFromHints({
        hintHeadline: params.hintOperTrustHeadline,
        hintUrgency: params.hintOperTrustUrgency,
    });

    const layout = {
        mode: "workflow_v1" as const,
        tabs,
        default_tab,
        shell,
    };

    if (!opportunityDrawerFirstPaintContractValid({ layout, first_paint })) {
        throw new Error("drawer_vm_first_paint_contract_invalid");
    }

    const attentionRaw = record._operational_attention as OpportunityAttentionResult | null | undefined;

    const lifecycle_rail = buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata: deptMetadata,
        statusKey,
        statusDefs,
        workUnitMetadata: wuData?.metadata ?? null,
    });
    const stage_context = resolveStageOperatingPlanPurpose({
        departmentMetadata: deptMetadata,
        builderStageKey: lifecycle_rail?.current_stage_key ?? null,
    });
    const currentStageKey = lifecycle_rail?.current_stage_key ?? null;
    const currentStageLabel =
        lifecycle_rail?.stages.find((s) => s.key === currentStageKey)?.label ?? null;
    // The communications preview is a first-paint seed only; the Activity embedded workspace
    // fetches it on demand (and prewarms on idle). Deferring it drops one server round-trip
    // from the record-open critical path and removes a redundant comms request on the surface.
    const communicationsPreviewP = params.deferCommunicationsPreview
        ? Promise.resolve(null)
        : (async () => {
              const tCommsPreview0 = Date.now();
              const preview = await resolveFamilyCommunicationWorkspacePreview(supabase, orgId, {
                  entityType: "opportunities",
                  entityId: opportunityId,
                  focusOpportunityId: opportunityId,
                  composerChannel: "email",
                  viewerUserId: gate.userId,
                  familyStageLabel: currentStageLabel,
              });
              phases.activity_comms_preview_ms = Date.now() - tCommsPreview0;
              return preview;
          })();
    // Stage work (Current Work region) is heavy — two operational_tasks reads — and does NOT feed
    // the above-fold render model built above. On the workspace inline Focus Panel path it is
    // deferred to a thin canonical resource resolved after first paint; the VM carries a `pending`
    // load state so the region shows a neutral loading treatment, never a false "No active work".
    const deferStageWork = params.deferStageWork === true;
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
    const stage_work_state: StageWorkLoadState = deferStageWork
        ? { status: "pending" }
        : stage_work_runtime
          ? { status: "ready", value: stage_work_runtime }
          : { status: "empty" };
    const rawTasksSummary = parseInquirySummaryTasksFromRecord(record);
    // Null runtime leaves tasks unfiltered (Tier 1); the client re-filters when stage work lands.
    const filteredTasksSummary = filterResidualOperationalTasks(rawTasksSummary, stage_work_runtime);
    record._inquiry_summary_tasks = filteredTasksSummary;
    if (record._overview_data && typeof record._overview_data === "object" && !Array.isArray(record._overview_data)) {
        (record._overview_data as Record<string, unknown>)._inquiry_summary_tasks = filteredTasksSummary;
    }
    record._stage_work_runtime = stage_work_runtime;
    record._work_intent_runtime = work_intent_runtime;
    const status_can_mutate = resolveOpportunityDrawerStatusCanMutateFromGate({
        role: gate.role,
        roleKeys: gate.roleKeys,
    });

    const viewModel: OpportunityDrawerViewModel = {
        generation: computeOpportunityDrawerViewModelGeneration({
            orgId,
            opportunityId,
            departmentId,
            workUnitId: workUnitId || null,
            statusKey,
            layoutVersion: layoutParsed.layout_version,
            headerActionKeys: headerActions.map((a) => a.key),
            aboveFoldSectionKeys: aboveFoldRenderModel.sections.map((s) => s.section_key),
        }),
        structureSettled: true,
        compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
        entity: { type: "opportunity", id: opportunityId },
        workspace: {
            department_id: departmentId,
            work_unit_id: workUnitId || null,
            /** Raw work-unit JSON (v1/v2) — client lifecycle parser re-coerces via resolveWorkUnitQueueDefinitionForDrawer. */
            queue_definition: wuData?.queue_definition ?? null,
            lifecycle_rail,
            stage_context,
            work_intent_runtime,
            stage_work_runtime,
            published_stage_inputs,
            stage_work: stage_work_state,
        },
        first_paint,
        header: {
            title: buildOpportunityDrawerHeaderTitle(record),
            subtitle: buildOpportunityDrawerHeaderSubtitle(record),
            status: buildOpportunityStatusControlVm({
                record,
                statusDefs,
                layoutMode: "workflow_v1",
                configuredStages:
                    lifecycle_rail?.stages.map((s, index) => ({
                        id: s.key,
                        key: s.key,
                        label: s.label,
                        sort_order: index,
                        is_active: true,
                    })) ?? null,
            }),
            status_can_mutate,
            oper_trust_preview,
        },
        actions: {
            header: headerActions,
            header_menu: headerMenuActions,
            manage_menu: headerMenuActions,
            record_header: resolvedActions,
        },
        layout,
        activity: {
            communicationsPreviewVm,
        },
        above_fold: {
            render_model: aboveFoldRenderModel,
            record: stripOpportunityDrawerRecordStaging(record),
        },
        summaries: {
            tasks: filteredTasksSummary,
            active_tour_bookings: activeTourBookings,
            reminders,
            bos: buildOpportunityDrawerBosSummary(record),
            attention: buildOpportunityDrawerAttentionSummary(attentionRaw),
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

    return finishCompose({ ok: true, viewModel });
}
