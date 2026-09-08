/**
 * CP-1 / S4.4 — Initial Panel resource (Module A, Tier-2).
 *
 * The genuinely-new data the VISIBLE primary panel needs beyond the Provisioning Answer: readiness +
 * first-paint dependencies (attention / header actions / scheduled sends / tour bookings), the above-fold
 * render model, the first-paint contract, the header (identity + status control + primary action bar), the
 * registry actions, and the Tier-2 summaries. Bounded to the visible panel.
 *
 * It imports NOTHING from the Deferred Detail (Tier-3) resource. It does NOT own scheduling, deep
 * communications, documents/history, or stage-work. It does NOT recompute Household/Children (those are the
 * Provisioning Answer's, carried by `subjectIdentityTruth`) nor re-resolve committed-seeded stage work.
 *
 * Record ordering (S4.4, preserved from the inline composer): A mutates the shared `record` with
 * `_record_surface` + its first-paint patches BEFORE building the render model. The orchestrator runs Tier-3
 * (B) after A on the same record and snapshots + strips `above_fold.record` ONCE, so the paint record is
 * complete. (Isolating A's record mutation for a parallel A/B run is a later optimization.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { sanitizeDrawerOperTrustPreviewFromHints } from "@/lib/admin/sanitizeDrawerOperTrustPreview";
import { createReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import { tryEvaluateDrawerRecordReadiness } from "@/lib/completion/readinessDrawerBootstrap";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import {
    buildOpportunityDrawerViewModelAboveFold,
    compileOpportunityDrawerViewModelShell,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import {
    buildOpportunityDrawerHeaderSubtitle,
    buildOpportunityDrawerHeaderTitle,
    buildOpportunityStatusControlVm,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader";
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
import { aboveFoldSectionsStructureSettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import {
    buildOpportunityDrawerFirstPaintContract,
    opportunityDrawerFirstPaintContractValid,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";
import {
    headerActionsFromFirstPaintData,
    remindersFromFirstPaintData,
    resolveOpportunityDrawerFirstPaintDependencies,
    operatorRelevantTourBookingFromFirstPaintData,
    tourBookingsFromFirstPaintData,
} from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies";
import { loadOpportunityActivityEvents } from "@/lib/admin/loadOpportunityRelatedActivityEvents";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { RemindersSummaryVm, OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { InitialPanelResource } from "@/lib/adminV2/viewModel/drawer/opportunity/drawerVmComposition.types";

const EMPTY_REMINDERS: RemindersSummaryVm = {
    state: "empty",
    next_follow_up_iso: null,
    scheduled_send_count: 0,
    scheduled_sends: [],
};

function taskAssistEnabledOnServer(): boolean {
    const v = process.env.NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1";
}

export type BuildInitialPanelResourceParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    statusKey: string | null;
    /** The shared record (mutated in place: `_record_surface` + first-paint patches — see the header note). */
    record: Record<string, unknown>;
    deptMetadata: Record<string, unknown> | null;
    layoutConfigJson: RecordLayoutConfigJson;
    queueDefinition: QueueDefinitionV1 | null;
    wuMetadata: unknown;
    statusDefs: StatusDefinitionRow[];
    lifecycleRail: OpportunityDrawerViewModel["workspace"]["lifecycle_rail"];
    hintOperTrustHeadline?: string | null;
    hintOperTrustUrgency?: string | null;
};

export type BuildInitialPanelResourceResult =
    | ({ ok: true } & InitialPanelResource)
    | { ok: false; reason: "layout_unavailable" };

/** Compose the Tier-2 Initial Panel resource, or a `layout_unavailable` skip (shell could not compile). */
export async function buildInitialPanelResource(
    params: BuildInitialPanelResourceParams
): Promise<BuildInitialPanelResourceResult> {
    const {
        supabase,
        gate,
        opportunityId,
        departmentId,
        workUnitId,
        statusKey,
        record,
        deptMetadata,
        layoutConfigJson,
        queueDefinition,
        wuMetadata,
        statusDefs,
        lifecycleRail,
    } = params;
    const phases_ms: Record<string, number> = {};

    const readinessMemo = createReadinessMemoScope();
    const readiness = tryEvaluateDrawerRecordReadiness({
        orgId: gate.orgId,
        opportunityId,
        entity: record,
        departmentId,
        workUnitId: workUnitId || null,
        departmentMetadata: deptMetadata,
        memoScope: readinessMemo,
    });

    record._record_surface = "full";

    const shell = compileOpportunityDrawerViewModelShell({ layoutConfig: layoutConfigJson, record });
    if (!shell) {
        return { ok: false, reason: "layout_unavailable" };
    }

    const task_assist_enabled = taskAssistEnabledOnServer();
    const firstViewportPlan = buildOpportunityFirstViewportPlan({
        shell,
        task_assist_enabled,
        queue_definition_present: queueDefinition != null,
    });

    const tDeps0 = Date.now();
    // The Activity leg runs BESIDE the first-paint dependencies, so its own completion has to be
    // stamped where it finishes. Reporting `Date.now() - tDeps0` for both legs made the two phases
    // report one identical number and hid which leg the wait actually belonged to.
    let tActivityDone: number | null = null;
    const stampActivity = <T,>(value: T): T => {
        tActivityDone = Date.now();
        return value;
    };
    const [resolved, activityRows] = await Promise.all([
        resolveOpportunityDrawerFirstPaintDependencies({
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
            wuMetadata,
            departmentMetadata: deptMetadata,
            readiness: readiness ?? null,
        }),
        // Same canonical activity set as Focus Panel Activity / What's Next Recent Activity.
        loadOpportunityActivityEvents({
            supabase,
            orgId: gate.orgId,
            opportunityId,
            limit: 24,
        })
            .then(stampActivity)
            .catch((err) => {
                console.warn(
                    "[initialPanelResource] activity timeline hydrate failed",
                    err instanceof Error ? err.message : err,
                );
                return stampActivity([] as Awaited<ReturnType<typeof loadOpportunityActivityEvents>>);
            }),
    ]);
    Object.assign(record, resolved.record_patches);
    if (activityRows.length > 0) {
        record._activity_timeline_events = activityRows.map((row) => ({
            id: row.id,
            occurred_at: row.occurred_at,
            event_type: row.event_type,
            payload: row.payload,
        }));
    }
    Object.assign(phases_ms, resolved.phases_ms);
    phases_ms.first_paint_resolve_ms = Date.now() - tDeps0;
    phases_ms.activity_timeline_hydrate_ms = tActivityDone === null ? 0 : tActivityDone - tDeps0;

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

    const layout = { mode: "workflow_v1" as const, tabs, default_tab, shell };
    if (!opportunityDrawerFirstPaintContractValid({ layout, first_paint })) {
        throw new Error("drawer_vm_first_paint_contract_invalid");
    }

    const status_can_mutate = resolveOpportunityDrawerStatusCanMutateFromGate({
        role: gate.role,
        roleKeys: gate.roleKeys,
    });
    const attentionRaw = record._operational_attention as OpportunityAttentionResult | null | undefined;

    return {
        ok: true,
        header: {
            title: buildOpportunityDrawerHeaderTitle(record),
            subtitle: buildOpportunityDrawerHeaderSubtitle(record),
            status: buildOpportunityStatusControlVm({
                record,
                statusDefs,
                layoutMode: "workflow_v1",
                configuredStages:
                    lifecycleRail?.stages.map((s, index) => ({
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
        first_paint,
        aboveFoldRenderModel,
        summaries: {
            tasks_raw: parseInquirySummaryTasksFromRecord(record),
            active_tour_bookings: activeTourBookings,
            // Terminal states included: a finished or cancelled tour is operator-relevant truth.
            operator_relevant_tour_booking: operatorRelevantTourBookingFromFirstPaintData(resolved.data),
            reminders,
            bos: buildOpportunityDrawerBosSummary(record),
            attention: buildOpportunityDrawerAttentionSummary(attentionRaw),
        },
        phases_ms,
    };
}
