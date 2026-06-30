/**
 * Operational Context adapter.
 *
 * The ONLY sanctioned bridge from the existing composed subject payload to the
 * forward-facing `OperationalContext` boundary. This is a thin seam, not a
 * refactor: the composed `OperationalSubjectViewModel` (internally still the
 * opportunity drawer VM during migration) stays as-is; this adapter projects the
 * fields cards are allowed to depend on.
 *
 *   Existing composed VM payload
 *     → buildOperationalContext (this file)
 *       → Focus Panel
 *         → Cards
 *
 * New card code must consume `OperationalContext`, never the drawer VM directly.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 */

import type { OperationalSubjectViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { StageWorkItemProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type {
    OperationalCommunicationsSignal,
    OperationalContext,
    OperationalContextSignals,
    OperationalContextStatus,
    OperationalWorkItem,
    OperationalWorkUrgency,
} from "@/lib/adminV2/runtime/operationalContext/types";

export type BuildOperationalContextInput = {
    subjectId: string;
    /** Operator-facing subject label (record/household title). */
    title: string;
    /** Composed subject ViewModel (internal payload; not exposed to cards). */
    subjectVm: OperationalSubjectViewModel;
    /** Composed, observed subject truth (above-fold record). */
    truth: Record<string, unknown>;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
    canMutate: boolean;
    /** Optional overrides; default `ready` (cards mount only when ready). */
    status?: OperationalContextStatus;
    maskedChannels?: boolean;
};

const MS_PER_DAY = 86_400_000;

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Days from start of today to the due date (negative = overdue). */
function dueDeltaDays(dueAt: string, now: Date): number | null {
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return null;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    return Math.round((startOfDue - startOfToday) / MS_PER_DAY);
}

function dueLabelAndUrgency(
    dueAt: string | null,
    now: Date,
): { dueLabel: string | null; urgency: OperationalWorkUrgency } {
    if (!dueAt) return { dueLabel: null, urgency: null };
    const delta = dueDeltaDays(dueAt, now);
    if (delta == null) return { dueLabel: null, urgency: null };
    if (delta < 0) {
        const days = Math.abs(delta);
        return { dueLabel: `Overdue ${days} day${days === 1 ? "" : "s"}`, urgency: "overdue" };
    }
    if (delta === 0) return { dueLabel: "Due today", urgency: "today" };
    if (delta === 1) return { dueLabel: "Due tomorrow", urgency: "upcoming" };
    return { dueLabel: `Due ${dueAt.slice(0, 10)}`, urgency: "upcoming" };
}

function stageWorkItem(
    item: StageWorkItemProjection,
    now: Date,
): OperationalWorkItem {
    const { dueLabel, urgency } = dueLabelAndUrgency(item.due_at, now);
    const state =
        item.state === "completed" ? "completed" : item.state === "open" ? "open" : "planned";
    return {
        id: item.work_id ?? item.template_key,
        label: trimOrNull(item.label) ?? trimOrNull(item.template_key) ?? "Work",
        state,
        dueLabel,
        dueAt: item.due_at,
        urgency,
        source: "Stage work",
        kind: "stage_work",
    };
}

const WORK_URGENCY_RANK: Record<NonNullable<OperationalWorkUrgency>, number> = {
    overdue: 0,
    today: 1,
    upcoming: 2,
};

function rankWorkItem(item: OperationalWorkItem): number {
    return item.urgency ? WORK_URGENCY_RANK[item.urgency] : 3;
}

/**
 * Project work / attention / tour signals from the composed subject VM. This is
 * the bridge — cards never read these VM shapes directly; they observe
 * `context.signals`. Read-once; no I/O.
 */
function buildOperationalContextSignals(
    subjectVm: OperationalSubjectViewModel,
    now: Date,
): OperationalContextSignals {
    const stageRuntime = subjectVm.workspace.stage_work_runtime;
    const tasks = subjectVm.summaries.tasks;
    const attention = subjectVm.summaries.attention;
    const tourBookings = subjectVm.summaries.active_tour_bookings ?? [];
    const headerAction = subjectVm.actions.header_menu[0] ?? null;

    const items: OperationalWorkItem[] = [];

    // Configured stage work (primary + additional) that is still actionable.
    if (stageRuntime?.primary && stageRuntime.primary.state !== "completed") {
        items.push(stageWorkItem(stageRuntime.primary, now));
    }
    for (const additional of stageRuntime?.additional ?? []) {
        if (additional.state !== "completed") items.push(stageWorkItem(additional, now));
    }

    // Open operational tasks (shell-owned preview).
    for (const task of tasks?.open_tasks ?? []) {
        const { dueLabel, urgency } = dueLabelAndUrgency(task.due_at ?? null, now);
        items.push({
            id: trimOrNull(task.id) ?? trimOrNull(task.title) ?? "task",
            label: trimOrNull(task.title) ?? "Task",
            state: "open",
            dueLabel,
            dueAt: task.due_at ?? null,
            urgency,
            source: trimOrNull(task.source),
            kind: "task",
        });
    }

    items.sort((a, b) => rankWorkItem(a) - rankWorkItem(b));

    const openCount = items.filter((i) => i.state === "open").length;
    const overdueCount = items.filter((i) => i.urgency === "overdue").length;

    const nextBooking = tourBookings[0];

    return {
        work: {
            primary: items[0] ?? null,
            items,
            openCount,
            overdueCount,
            nextActionLabel: trimOrNull(headerAction?.label),
        },
        attention: {
            needsAttention: Boolean(attention?.needs_attention),
            primaryReason: trimOrNull(attention?.primary_reason),
            reasonCount: attention?.reason_count ?? 0,
        },
        tour: {
            scheduled: tourBookings.length > 0,
            startAt: trimOrNull(nextBooking?.start_at),
            statusLabel: trimOrNull(nextBooking?.status_key),
            bookingId: trimOrNull(nextBooking?.id),
        },
        communications: buildCommunicationsSignal(subjectVm),
    };
}

function buildCommunicationsSignal(
    subjectVm: OperationalSubjectViewModel,
): OperationalCommunicationsSignal {
    const reminders = subjectVm.summaries.reminders;
    const scheduledSendCount = reminders?.scheduled_send_count ?? 0;
    const nextFollowUpAt = reminders?.next_follow_up_iso ?? null;
    const pendingSends = (reminders?.scheduled_sends ?? []).filter((s) => s.status === "pending");
    return {
        scheduledSendCount,
        nextFollowUpAt: trimOrNull(nextFollowUpAt),
        hasOutreach: scheduledSendCount > 0 || nextFollowUpAt != null,
        nextScheduledSendId: trimOrNull(pendingSends[0]?.id),
    };
}

/**
 * Project the composed subject payload into an `OperationalContext`. Pure; safe
 * inside `useMemo`. Performs no I/O — `truth` is already composed upstream.
 */
export function buildOperationalContext(input: BuildOperationalContextInput): OperationalContext {
    const { subjectVm, truth, perspective, statusLabel, canMutate } = input;

    const stageContext = subjectVm.workspace.stage_context;
    const lifecycleRail = subjectVm.workspace.lifecycle_rail;

    return {
        subject: {
            type: subjectVm.entity.type,
            id: input.subjectId,
            label: input.title,
        },
        businessProcess: {
            key: stageContext?.stage_key ?? null,
            label: stageContext?.stage_label ?? statusLabel ?? null,
            stageKey: lifecycleRail?.current_stage_key ?? stageContext?.stage_key ?? null,
        },
        perspective: perspective
            ? { missionLabel: perspective.defaultMission ?? perspective.label ?? null }
            : null,
        truth,
        signals: buildOperationalContextSignals(subjectVm, new Date()),
        capabilities: {
            canMutate,
            maskedChannels: input.maskedChannels ?? false,
        },
        status: input.status ?? "ready",
    };
}
