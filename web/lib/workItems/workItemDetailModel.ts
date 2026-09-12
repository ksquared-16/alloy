/**
 * Work Items — operator-facing detail model.
 *
 * Turns a work item row into the four things an operator needs before acting: what it is, what
 * state it is in, who/what it is about, and why it is in their queue. Runtime machinery
 * (operating-plan keys, projection internals, provenance strings, stage-position mechanics) is
 * deliberately absent — meaning-first doctrine puts business meaning ahead of schema, and a field
 * whose only honest value is "not projected yet" is noise, not context.
 *
 * Completion authority is NOT owned here. This model only reports which domain owns the act, so the
 * detail surface can route the operator to that domain's runtime instead of inventing a second write.
 */

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { isCommunicationsProjectedWorkItem } from "@/lib/workItems/mapCommunicationThreadToWorkItemRow";
import { isProcessingProjectedWorkItem } from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import {
    resolveWorkItemProcessLabel,
    resolveWorkItemStageLabel,
    type WorkItemBpLabelOptions,
} from "@/lib/workItems/workItemBpProvenance";

export type WorkItemSourceKind = "business_process" | "communications" | "processing" | "manual";

/** Which domain runtime owns completing this work. Work Items never owns a projected source. */
export type WorkItemCompletionAuthority =
    | "current_work"
    | "communications"
    | "processing"
    | "work_items";

/*
 * `waiting` was a member here and `resolveWorkItemDetailState` never returned it — the detail panel
 * carried a chip for a state the derivation cannot produce. It is removed with the chip, so a
 * label naming a non-existent state cannot reappear by someone simply making it reachable.
 */
export type WorkItemDetailState = "completed" | "overdue" | "due_today" | "open";

export type WorkItemDetailModel = {
    kind: WorkItemSourceKind;
    completionAuthority: WorkItemCompletionAuthority;
    /** One plain sentence: why is this in my queue? */
    reason: string;
    /** Where the work came from, in operator language (e.g. "Enrollment → Tour Scheduled"). */
    originPath: string | null;
    state: WorkItemDetailState;
    subjectLabel: string | null;
    subjectDetail: string | null;
};

export function resolveWorkItemSourceKind(task: MyTasksTaskRow): WorkItemSourceKind {
    if (isCommunicationsProjectedWorkItem(task)) return "communications";
    if (isProcessingProjectedWorkItem(task)) return "processing";
    if (isBusinessProcessStageWorkTaskRow(task)) return "business_process";
    return "manual";
}

/**
 * Completion authority per source. Manual work is the only kind Work Items may close itself; every
 * projection is a view onto a domain that already owns the act.
 */
export function resolveWorkItemCompletionAuthority(
    kind: WorkItemSourceKind,
): WorkItemCompletionAuthority {
    switch (kind) {
        case "business_process":
            return "current_work";
        case "communications":
            return "communications";
        case "processing":
            return "processing";
        case "manual":
            return "work_items";
    }
}

/**
 * Due state, derived once. Every Work Items surface that renders urgency must come through here so
 * a KPI tile, a folder count, a queue filter and this panel cannot disagree about the same row.
 */
export function resolveWorkItemDetailState(
    task: MyTasksTaskRow,
    nowMs: number = Date.now(),
): WorkItemDetailState {
    if (task.status === "completed" || task.status === "canceled") return "completed";
    const due = Date.parse(task.due_at ?? "");
    if (!Number.isFinite(due)) return "open";
    if (due < nowMs) return "overdue";
    const endOfToday = new Date(nowMs);
    endOfToday.setHours(23, 59, 59, 999);
    if (due <= endOfToday.getTime()) return "due_today";
    return "open";
}

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function buildOriginPath(task: MyTasksTaskRow, options?: WorkItemBpLabelOptions): string | null {
    const process = resolveWorkItemProcessLabel(task, options);
    const stage = resolveWorkItemStageLabel(task, options);
    if (process === "General work" && !stage) return null;
    return [process === "General work" ? null : process, stage].filter(Boolean).join(" → ") || null;
}

export function buildWorkItemDetailModel(
    task: MyTasksTaskRow,
    options?: WorkItemBpLabelOptions,
    nowMs?: number,
): WorkItemDetailModel {
    const kind = resolveWorkItemSourceKind(task);
    const state = resolveWorkItemDetailState(task, nowMs);

    if (kind === "communications") {
        const family = trimOrNull(task.communication_family_label);
        return {
            kind,
            completionAuthority: "communications",
            reason: "A family message is waiting for a reply.",
            originPath: trimOrNull(task.communication_topic_label),
            state,
            subjectLabel: family,
            subjectDetail: trimOrNull(task.communication_channel),
        };
    }

    if (kind === "processing") {
        return {
            kind,
            completionAuthority: "processing",
            reason: "A processing case needs review.",
            originPath: trimOrNull(task.processing_source_label) ?? trimOrNull(task.processing_lane),
            state,
            subjectLabel: trimOrNull(task.entity_label) ?? trimOrNull(task.household_label),
            subjectDetail: trimOrNull(task.processing_lane),
        };
    }

    if (kind === "business_process") {
        const origin = buildOriginPath(task, options);
        return {
            kind,
            completionAuthority: "current_work",
            reason: origin
                ? `A business process created this work at the ${
                      resolveWorkItemStageLabel(task, options) ?? "current"
                  } stage.`
                : "A business process created this work.",
            originPath: origin,
            state,
            subjectLabel: trimOrNull(task.entity_label) ?? trimOrNull(task.household_label),
            subjectDetail: trimOrNull(task.contact_label),
        };
    }

    return {
        kind,
        completionAuthority: "work_items",
        reason: "Created manually.",
        originPath: null,
        state,
        subjectLabel: trimOrNull(task.entity_label) ?? trimOrNull(task.household_label),
        subjectDetail: trimOrNull(task.contact_label),
    };
}
