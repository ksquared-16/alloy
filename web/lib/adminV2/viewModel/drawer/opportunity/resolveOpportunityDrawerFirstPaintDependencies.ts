import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRouteGateSuccess } from "@/lib/admin/adminRouteGate";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { attachOpportunityAttentionSuggestionBundle } from "@/lib/admin/opportunityAttentionSuggestionAttachment";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { drawerFirstPaintDependenciesSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import { loadOpportunityTourProjectionForViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel";
import { loadOpportunityScheduledSendsPreview } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityScheduledSendsPreview";
import { loadSchedulingProjectionsForFirstPaint } from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";
import {
    opportunityFirstPaintDependencySatisfiedFromRecord,
    opportunityTourBookingsFetchRequired,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";
import type {
    OpportunityDrawerFirstPaintDependencyKey,
    OpportunityDrawerFirstPaintDependencyState,
    RemindersSummaryVm,
} from "@/lib/adminV2/viewModel/drawer/types";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

export type ResolvedFirstPaintDependencies = {
    dependencies: OpportunityDrawerFirstPaintDependencyState[];
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>;
    record_patches: Record<string, unknown>;
    phases_ms: Record<string, number>;
};

export type ResolveFirstPaintDependenciesParams = {
    supabase: SupabaseClient;
    gate: AdminRouteGateSuccess;
    opportunityId: string;
    departmentId: string | null;
    workUnitId: string | null;
    statusKey: string | null;
    record: Record<string, unknown>;
    dependencies: OpportunityDrawerFirstPaintDependencyKey[];
    queueDefinition: QueueDefinitionV1 | null;
    statusDefs: StatusDefinitionRow[];
    wuMetadata: unknown;
    departmentMetadata: Record<string, unknown> | null;
    readiness: ReadinessResult | null;
};

function planIncludes(plan: OpportunityDrawerFirstPaintDependencyKey[], key: OpportunityDrawerFirstPaintDependencyKey): boolean {
    return plan.includes(key);
}

function readyState(
    key: OpportunityDrawerFirstPaintDependencyKey,
    empty: boolean,
    satisfied_by: OpportunityDrawerFirstPaintDependencyState["satisfied_by"]
): OpportunityDrawerFirstPaintDependencyState {
    return {
        key,
        disposition: "first_paint_required",
        status: empty ? "empty" : "ready",
        satisfied_by,
    };
}

export async function resolveOpportunityDrawerFirstPaintDependencies(
    params: ResolveFirstPaintDependenciesParams
): Promise<ResolvedFirstPaintDependencies> {
    const phases_ms: Record<string, number> = {};
    const data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>> = {};
    const record_patches: Record<string, unknown> = {};
    const dependencies: OpportunityDrawerFirstPaintDependencyState[] = [];

    for (const key of params.dependencies) {
        if (opportunityFirstPaintDependencySatisfiedFromRecord(key, params.record)) {
            dependencies.push(readyState(key, false, "record_metadata"));
            continue;
        }

        dependencies.push({
            key,
            disposition: "first_paint_required",
            status: "pending",
            satisfied_by: "pending",
        });
    }

    const needsAttention = planIncludes(params.dependencies, "attention_bundle");
    const needsHeaderActions = planIncludes(params.dependencies, "header_actions");
    const needsScheduledSends = planIncludes(params.dependencies, "scheduled_sends");
    const needsScheduling = planIncludes(params.dependencies, "scheduling_projection");
    const needsTourBookings =
        planIncludes(params.dependencies, "tour_bookings") && opportunityTourBookingsFetchRequired(params.record);

    const tParallel0 = Date.now();
    /**
     * Bounded per-leg timing. This batch measured 941 ms of a 2,580 ms compose as a single number,
     * and a parallel batch costs its SLOWEST leg — which cannot be identified from the aggregate.
     */
    const timedLeg = async <T,>(key: string, work: Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
            return await work;
        } finally {
            phases_ms[`first_paint_${key}_ms`] = Date.now() - t0;
        }
    };
    const [attentionBundle, headerActions, reminders, tourBookings, schedulingProjection] = await Promise.all([
        needsAttention ?
            timedLeg("attention", attachOpportunityAttentionSuggestionBundle({
                supabase: params.supabase,
                orgId: params.gate.orgId,
                opportunityRow: params.record,
                defs: params.statusDefs,
                attentionConfigMetadata: params.wuMetadata ?? null,
                departmentMetadata: params.departmentMetadata,
                departmentId: params.departmentId,
                workUnitId: params.workUnitId,
                statusKey: params.statusKey,
                preloadedActivityOrgMetadata: {
                    workUnitMetadata: params.wuMetadata ?? null,
                    departmentMetadata: params.departmentMetadata,
                },
                readiness: params.readiness,
                readinessMemoScope: undefined,
            }))
        :   Promise.resolve(null),
        needsHeaderActions ?
            timedLeg("header_actions", resolveActionsForContext(params.supabase, {
                orgId: params.gate.orgId,
                surface: "record_header",
                entityType: "opportunity",
                entityId: params.opportunityId,
                departmentId: params.departmentId,
                workUnitId: params.workUnitId,
                hintOpportunityStatusKey: params.statusKey,
                hintOpportunityMetadata:
                    params.record.metadata && typeof params.record.metadata === "object" ?
                        (params.record.metadata as Record<string, unknown>)
                    :   null,
                lifecycleViewStageKey: stageKeyFromLifecycleWorkUnitMetadata(params.wuMetadata ?? null),
            }))
        :   Promise.resolve(null),
        needsScheduledSends ?
            timedLeg("scheduled_sends", loadOpportunityScheduledSendsPreview({
                supabase: params.supabase,
                orgId: params.gate.orgId,
                opportunityId: params.opportunityId,
                record: params.record,
            }))
        :   Promise.resolve(null),
        needsTourBookings ?
            timedLeg("tour_bookings", loadOpportunityTourProjectionForViewModel(params.supabase, params.gate.orgId, params.opportunityId))
        :   Promise.resolve({ active: [] as TourBookingRow[], operatorRelevant: null }),
        needsScheduling ?
            timedLeg("scheduling", loadSchedulingProjectionsForFirstPaint(params.supabase, params.gate.orgId, params.record))
        :   Promise.resolve(null),
    ]);
    phases_ms.first_paint_dependencies_ms = Date.now() - tParallel0;

    const finalize = (
        key: OpportunityDrawerFirstPaintDependencyKey,
        state: OpportunityDrawerFirstPaintDependencyState
    ) => {
        const idx = dependencies.findIndex((d) => d.key === key);
        if (idx >= 0) dependencies[idx] = state;
        else dependencies.push(state);
    };

    if (planIncludes(params.dependencies, "record_visible")) {
        /**
         * THE READINESS STAYS; THE SECOND COPY GOES.
         *
         * `data.record_visible = params.record` published the SAME OBJECT REFERENCE the orchestrator
         * also snapshots as `above_fold.record`, so the response carried the visible record twice.
         * Measured on the certification tenant: 51,787 B and 51,548 B, byte-identical on every one of
         * their 93 shared keys, zero differing keys — 28% of a 178 KB response, serialised twice for
         * one truth.
         *
         * Nothing reads it. The census across `lib`, `components` and `app` finds only this producer,
         * the dependency-key union, the first-viewport contract that declares the KEY, and a demo
         * fixture; the single generic reader of `first_paint.data` takes tour bookings. Every
         * consumer of the visible record reads `above_fold.record`.
         *
         * So the readiness declaration is unchanged — `record_visible` is still satisfied at first
         * paint, from `record_metadata`, which is what the contract promises — and only the redundant
         * payload copy is dropped. Consumers that want the record still find it in exactly one place.
         */
        finalize("record_visible", readyState("record_visible", false, "record_metadata"));
    }

    if (planIncludes(params.dependencies, "status_definitions")) {
        data.status_definitions = params.statusDefs;
        finalize(
            "status_definitions",
            readyState("status_definitions", params.statusDefs.length === 0, "server_fetch")
        );
    }

    if (planIncludes(params.dependencies, "queue_definition")) {
        data.queue_definition = params.queueDefinition;
        finalize(
            "queue_definition",
            readyState("queue_definition", params.queueDefinition == null, "record_metadata")
        );
    }

    if (planIncludes(params.dependencies, "inquiry_children")) {
        const children = params.record._inquiry_children;
        const empty = !Array.isArray(children) || children.length === 0;
        data.inquiry_children = children;
        finalize("inquiry_children", readyState("inquiry_children", empty, "record_metadata"));
    }

    if (planIncludes(params.dependencies, "tasks_preview")) {
        data.tasks_preview = params.record._inquiry_summary_tasks;
        finalize("tasks_preview", readyState("tasks_preview", false, "record_metadata"));
    }

    if (needsAttention && attentionBundle) {
        data.attention_bundle = attentionBundle;
        Object.assign(record_patches, attentionBundle);
        finalize("attention_bundle", readyState("attention_bundle", false, "server_fetch"));
    }

    if (needsHeaderActions && headerActions) {
        data.header_actions = headerActions;
        finalize(
            "header_actions",
            readyState("header_actions", (headerActions.header ?? []).length === 0, "server_fetch")
        );
    }

    if (needsScheduledSends && reminders) {
        data.scheduled_sends = reminders;
        finalize(
            "scheduled_sends",
            readyState("scheduled_sends", reminders.state === "empty", "server_fetch")
        );
    }

    if (planIncludes(params.dependencies, "tour_bookings")) {
        // The leg now carries both answers; readiness still speaks about the active list.
        const projection = tourBookings ?? { active: [] as TourBookingRow[], operatorRelevant: null };
        data.tour_bookings = projection;
        finalize("tour_bookings", readyState("tour_bookings", projection.active.length === 0, "server_fetch"));
    }

    if (needsScheduling) {
        const projection = schedulingProjection ?? { byMemberId: {}, asOf: "" };
        data.scheduling_projection = projection;
        // Attach to the record so the Scheduling card reads it synchronously from
        // context.truth (reveals with the panel; no per-child client fetch).
        record_patches._scheduling_projection = projection;
        const empty = Object.keys(projection.byMemberId).length === 0;
        finalize("scheduling_projection", readyState("scheduling_projection", empty, "server_fetch"));
    }

    return { dependencies, data, record_patches, phases_ms };
}

export { drawerFirstPaintDependenciesSettled as firstPaintDependenciesSettled };

export function remindersFromFirstPaintData(
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>
): RemindersSummaryVm | null {
    const raw = data.scheduled_sends;
    if (!raw || typeof raw !== "object") return null;
    return raw as RemindersSummaryVm;
}

export function headerActionsFromFirstPaintData(
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>
): ResolvedActionsBySlot | null {
    const raw = data.header_actions;
    if (!raw || typeof raw !== "object") return null;
    return raw as ResolvedActionsBySlot;
}

/** The bookings the family may still attend. Unchanged meaning, now read off the projection. */
export function tourBookingsFromFirstPaintData(
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>
): TourBookingRow[] {
    const raw = data.tour_bookings as { active?: unknown } | unknown;
    // Tolerates the pre-projection shape (a bare array) so a cached leg cannot break first paint.
    if (Array.isArray(raw)) return raw as TourBookingRow[];
    const active = (raw as { active?: unknown } | null)?.active;
    return Array.isArray(active) ? (active as TourBookingRow[]) : [];
}

/** The one booking the Tour concept speaks for, terminal states included. */
export function operatorRelevantTourBookingFromFirstPaintData(
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>
): TourBookingRow | null {
    const raw = data.tour_bookings as { operatorRelevant?: unknown } | unknown;
    if (Array.isArray(raw)) return null; // pre-projection shape carried no such answer
    return ((raw as { operatorRelevant?: TourBookingRow | null } | null)?.operatorRelevant) ?? null;
}
