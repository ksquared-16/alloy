"use client";

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { ScheduledTourConfirmation } from "@/lib/lifecycle/scheduledTourCloseConfirmation";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/executeStageOperatingOutcome";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageWorkOutcomeResolution = {
    requires_outcome_picker: boolean;
    department_id?: string;
    stage_key?: string;
    work_id?: string;
    work_title?: string;
    outcomes?: StageCompletionOutcomeV1[];
    subject?: StageOutcomeExecutionSubject;
};

export async function fetchStageWorkOutcomeResolution(params: {
    taskId: string;
    departmentId?: string | null;
}): Promise<StageWorkOutcomeResolution> {
    const qs = new URLSearchParams({ task_id: params.taskId });
    if (params.departmentId?.trim()) {
        qs.set("department_id", params.departmentId.trim());
    }
    const res = await fetch(
        `/api/admin/lifecycle-builder/stage-work-outcomes?${qs.toString()}`,
        workspaceDataFetchInit(),
    );
    const json = (await res.json().catch(() => ({}))) as StageWorkOutcomeResolution & { error?: string };
    if (!res.ok) {
        throw new Error(json.error ?? "Failed to load outcomes");
    }
    return json;
}

/** What the outcome did, as far as the surface needs to know to decide what to show next. */
export type StageWorkOutcomeCompletion = {
    ok: boolean;
    error?: string;
    queue_refresh_opportunity_id?: string;
    /** The outcome moved the record to another stage — this work's surface no longer applies. */
    moved_stage?: boolean;
    /** The outcome would close a Tour that is still ahead; nothing was written. Ask, then resubmit. */
    confirmation_required?: ScheduledTourConfirmation | null;
    scheduled_tour_closed?: { booking_id: string; closed_as: "completed" | "canceled" } | null;
};

export async function completeStageWorkWithSelectedOutcome(params: {
    departmentId: string;
    stageKey: string;
    workId: string;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
    confirmCloseScheduledTour?: boolean;
}): Promise<StageWorkOutcomeCompletion> {
    const res = await fetch("/api/admin/lifecycle-builder/complete-stage-work", {
        ...workspaceDataFetchInit(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            department_id: params.departmentId,
            stage_key: params.stageKey,
            work_id: params.workId,
            outcome_key: params.outcomeKey,
            subject: params.subject,
            ...(params.confirmCloseScheduledTour ? { confirm_close_scheduled_tour: true } : {}),
        }),
    });
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        queue_refresh_opportunity_id?: string;
        confirmation_required?: ScheduledTourConfirmation;
        scheduled_tour_closed?: { booking_id: string; closed_as: "completed" | "canceled" } | null;
        outcome_execution?: { applied_targets?: Array<{ kind?: string; executed?: boolean }> };
    };
    if (res.status === 409 && json.confirmation_required) {
        return { ok: false, error: json.confirmation_required.message, confirmation_required: json.confirmation_required };
    }
    if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to complete work" };
    }
    return {
        ok: true,
        queue_refresh_opportunity_id: json.queue_refresh_opportunity_id,
        moved_stage: (json.outcome_execution?.applied_targets ?? []).some(
            (t) => t?.kind === "move_to_stage" && t.executed !== false,
        ),
        scheduled_tour_closed: json.scheduled_tour_closed ?? null,
    };
}
