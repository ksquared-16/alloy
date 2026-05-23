import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { drawerOperationalStripReady } from "@/lib/adminV2/drawerPipeline/layoutLock";
import type {
    DrawerEnrichmentState,
    DrawerInquirySummaryRightColumnRenderModel,
    DrawerRightColumnSlotState,
} from "@/lib/adminV2/drawerPipeline/types";

function nextFollowUpFromRecord(record: Record<string, unknown>): string | null {
    const top = record.next_follow_up_at;
    if (typeof top === "string" && top.trim()) return top.trim();
    const md = record.metadata;
    if (md && typeof md === "object") {
        const nested = (md as { next_follow_up_at?: unknown }).next_follow_up_at;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
}

function tasksSlotState(
    taskPreview: ReturnType<typeof parseInquirySummaryTaskPreview>,
    enrichment: DrawerEnrichmentState
): DrawerRightColumnSlotState {
    if (taskPreview) {
        return taskPreview.open_count > 0 ? "ready" : "empty";
    }
    if (enrichment.primary_loaded || enrichment.full_complete) return "skeleton";
    return "pending";
}

function remindersSlotState(
    nextFollowUpIso: string | null,
    enrichment: DrawerEnrichmentState
): DrawerRightColumnSlotState {
    if (nextFollowUpIso) return "ready";
    if (enrichment.primary_loaded || enrichment.full_complete) return "empty";
    return "pending";
}

/**
 * Atomic right-column structure for inquiry summary — stable across drawer_primary and full.
 */
export function buildInquirySummaryRightColumnModel(input: {
    record: Record<string, unknown>;
    enrichment: DrawerEnrichmentState;
    below_fold_enrichment_ready: boolean;
    task_assist_enabled: boolean;
}): DrawerInquirySummaryRightColumnRenderModel {
    if (!input.task_assist_enabled) {
        return {
            tasks: { visible: false, state: "pending", open_count: 0, open_tasks: [] },
            reminders: { visible: false, state: "pending", next_follow_up_iso: null },
            orchestrator_handoff: { visible: false, state: "hidden" },
        };
    }

    const taskPreview = parseInquirySummaryTaskPreview(input.record);
    const nextFollowUpIso = nextFollowUpFromRecord(input.record);
    const handoffVisible = drawerOperationalStripReady(
        true,
        input.below_fold_enrichment_ready,
        input.enrichment
    );

    return {
        tasks: {
            visible: true,
            state: tasksSlotState(taskPreview, input.enrichment),
            open_count: taskPreview?.open_count ?? 0,
            open_tasks: taskPreview?.open_tasks ?? [],
        },
        reminders: {
            visible: true,
            state: remindersSlotState(nextFollowUpIso, input.enrichment),
            next_follow_up_iso: nextFollowUpIso,
        },
        orchestrator_handoff: {
            visible: handoffVisible,
            state: handoffVisible ? "ready" : "hidden",
        },
    };
}

/** Regression guard: structure keys stable; only value phases may differ. */
export function rightColumnStructureKeys(model: DrawerInquirySummaryRightColumnRenderModel): string[] {
    const keys: string[] = [];
    if (model.tasks.visible) keys.push("tasks");
    if (model.reminders.visible) keys.push("reminders");
    if (model.orchestrator_handoff.visible) keys.push("orchestrator_handoff");
    return keys;
}
