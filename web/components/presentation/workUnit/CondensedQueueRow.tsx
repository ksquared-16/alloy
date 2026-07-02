"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE_ROW.
 *
 * One-line condensed queue row rendered ONLY from the frozen `QueueRowContext` contract
 * (web/lib/workUnits/lifecycleSubjectContracts.ts). Rows without an attached context render
 * the entity id fallback line — still clickable. The entire row is one button; opens flow
 * through the FocusPanelSurface seam via `onOpen`.
 */

import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

/** Subject display: single subject name; grouped rows join subjects or fall back to count. */
function subjectDisplayName(context: QueueRowContext): string {
    if (context.row_presentation_mode === "grouped_subjects") {
        if (context.row_subjects?.length) {
            return context.row_subjects.map((s) => s.display_name).join(", ");
        }
        if (context.row_count != null) {
            const unit = (context.row_count_unit ?? "records").replace(/_/g, " ");
            return `${context.row_count} ${unit}`;
        }
    }
    return context.row_subject.display_name;
}

const ROW_BUTTON_CLASS =
    "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-alloy-stone/10";

export function CondensedQueueRow({
    row,
    onOpen,
    isFirst,
}: {
    row: QueueRowModel;
    onOpen: (row: QueueRowModel) => void;
    isFirst?: boolean;
}) {
    const context = row.context;

    if (!context) {
        return (
            <button
                type="button"
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
                data-entity-id={row.entityId}
                data-entity-type={row.entityType}
                data-queue-row-first={isFirst ? "true" : undefined}
                onClick={() => onOpen(row)}
                className={ROW_BUTTON_CLASS}
            >
                <span className="min-w-0 flex-1 truncate text-sm text-alloy-midnight">{row.entityId}</span>
            </button>
        );
    }

    const stageLabel = context.row_status_label || context.row_stage;
    const needsAttention = context.attention_summary?.needs_attention === true;
    const attentionReason = needsAttention
        ? context.attention_summary?.primary_reason_label ?? null
        : null;
    const workLabel =
        context.current_work_summary?.label ??
        context.next_best_action?.label ??
        context.work_summary?.primary_open_label ??
        null;
    const dueLabel = context.current_work_summary?.due_label ?? null;

    return (
        <button
            type="button"
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
            data-entity-id={row.entityId}
            data-entity-type={row.entityType}
            data-queue-row-first={isFirst ? "true" : undefined}
            data-needs-attention={needsAttention ? "true" : undefined}
            onClick={() => onOpen(row)}
            className={ROW_BUTTON_CLASS}
        >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-alloy-midnight">
                {subjectDisplayName(context)}
            </span>
            {stageLabel ? (
                <span className="shrink-0 rounded-full border border-alloy-stone/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-midnight/70">
                    {stageLabel}
                </span>
            ) : null}
            {needsAttention ? (
                <span className="flex min-w-0 shrink items-center gap-1" title={attentionReason ?? undefined}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-ember" aria-hidden />
                    {attentionReason ? (
                        <span className="truncate text-xs text-alloy-ember">{attentionReason}</span>
                    ) : (
                        <span className="sr-only">Needs attention</span>
                    )}
                </span>
            ) : null}
            <span className="ml-auto flex shrink-0 items-center gap-2">
                {workLabel ? (
                    <span className="max-w-[16rem] truncate text-xs text-alloy-midnight/70">{workLabel}</span>
                ) : null}
                {dueLabel ? (
                    <span className="whitespace-nowrap text-[11px] text-alloy-stone">{dueLabel}</span>
                ) : null}
            </span>
        </button>
    );
}
