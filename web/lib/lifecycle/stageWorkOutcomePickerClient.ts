"use client";

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
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

export async function completeStageWorkWithSelectedOutcome(params: {
    departmentId: string;
    stageKey: string;
    workId: string;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
}): Promise<{ ok: boolean; error?: string; queue_refresh_opportunity_id?: string }> {
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
        }),
    });
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        queue_refresh_opportunity_id?: string;
    };
    if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to complete work" };
    }
    return {
        ok: true,
        queue_refresh_opportunity_id: json.queue_refresh_opportunity_id,
    };
}
