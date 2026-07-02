"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE_ROW.
 *
 * One-line condensed queue row rendered ONLY from the frozen `QueueRowContext` contract
 * (web/lib/workUnits/lifecycleSubjectContracts.ts). Rows without an attached context render
 * the entity id fallback line — still clickable. The entire row is one button; opens flow
 * through the FocusPanelSurface seam via `onOpen`.
 */

import { queueRowSubjectDisplayName, type QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

const ROW_BUTTON_CLASS =
    "relative flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-alloy-juniper/[0.04] active:bg-alloy-juniper/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper";

/** Persistent selected-record wash — same juniper language as the row's hover/active states. */
const ROW_SELECTED_CLASS = " bg-alloy-juniper/[0.07] hover:bg-alloy-juniper/[0.09]";

/** Persistent selected rail — marks the record currently open in the inline Focus Panel. */
function SelectedRail() {
    return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-alloy-juniper" />;
}

export function CondensedQueueRow({
    row,
    onOpen,
    isFirst,
    isSelected,
}: {
    row: QueueRowModel;
    onOpen: (row: QueueRowModel) => void;
    isFirst?: boolean;
    /** Row's record is the one open in the inline Focus Panel — persistent selected rail. */
    isSelected?: boolean;
}) {
    const context = row.context;
    const rowClass = isSelected ? ROW_BUTTON_CLASS + ROW_SELECTED_CLASS : ROW_BUTTON_CLASS;

    if (!context) {
        return (
            <button
                type="button"
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
                data-entity-id={row.entityId}
                data-entity-type={row.entityType}
                data-queue-row-first={isFirst ? "true" : undefined}
                data-queue-row-active={isSelected ? "true" : undefined}
                onClick={() => onOpen(row)}
                className={rowClass}
            >
                {isSelected ? <SelectedRail /> : null}
                <span className="min-w-0 flex-1 truncate text-[13px] leading-4 text-alloy-midnight/70">
                    {row.entityId}
                </span>
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
            data-queue-row-active={isSelected ? "true" : undefined}
            data-needs-attention={needsAttention ? "true" : undefined}
            onClick={() => onOpen(row)}
            className={rowClass}
        >
            {isSelected ? <SelectedRail /> : null}
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-4 text-alloy-midnight">
                {queueRowSubjectDisplayName(context)}
            </span>
            {stageLabel ? (
                <span className="max-w-[10rem] shrink-0 truncate rounded-full border border-alloy-midnight/15 bg-white px-2 py-0.5 text-[10px] font-semibold leading-[13px] text-alloy-midnight/60">
                    {stageLabel}
                </span>
            ) : null}
            {needsAttention ? (
                <span className="flex min-w-0 shrink items-center gap-1.5" title={attentionReason ?? undefined}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-ember" aria-hidden />
                    {attentionReason ? (
                        <span className="truncate text-[11px] font-semibold text-alloy-ember">
                            {attentionReason}
                        </span>
                    ) : (
                        <span className="sr-only">Needs attention</span>
                    )}
                </span>
            ) : null}
            <span className="ml-auto flex shrink-0 items-baseline gap-2">
                {workLabel ? (
                    <span className="max-w-[16rem] truncate text-[11px] text-alloy-midnight/60">
                        {workLabel}
                    </span>
                ) : null}
                {dueLabel ? (
                    <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-alloy-midnight/45">
                        {dueLabel}
                    </span>
                ) : null}
            </span>
        </button>
    );
}
