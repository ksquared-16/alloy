"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE_ROW.
 *
 * The approved split-view queue CARD (staging parity — see the CompressedQueueRow
 * anatomy in adminV2 history). Rendered ONLY from the frozen `QueueRowContext` contract
 * (web/lib/workUnits/lifecycleSubjectContracts.ts):
 *
 *   [32px avatar]  line 1 subject identity ··············· [status pill]
 *                  line 2 primary contact · related subjects (muted)
 *                  line 3 attention dot + reason (ember, when flagged)
 *                  line 4 grouped-count chip ····· current work · due (muted)
 *
 * Rows without an attached context render the entity-id fallback card — still clickable.
 * The entire card is one button; opens flow through the FocusPanelSurface seam via
 * `onOpen`. Only fields the frozen contract provides are rendered — nothing invented.
 *
 * The optional `rowConfig` (from the published Queue Row surface, mapped onto the compact
 * slots) tunes PLACEMENT only: it can hide a slot (`visible:false`) or override a slot's
 * label. When absent (unpublished / fetch failed) the row renders pure generic-context —
 * every slot visible, no label overrides — exactly as before. Config never invents content:
 * a slot with no context value stays empty regardless of config. Row order/membership are
 * server-owned (Work View sort_v1 via QueueService) — this component never sorts.
 */

import {
    queueRowSubjectDisplayName,
    type CompactRowSlots,
    type QueueRowModel,
} from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

type RowContext = NonNullable<QueueRowModel["context"]>;

const CARD_BUTTON_CLASS =
    "motion-control relative block w-full overflow-hidden rounded-lg border bg-white px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper";

const CARD_IDLE_CLASS =
    " border-alloy-stone/18 hover:bg-alloy-juniper/[0.04] active:bg-alloy-juniper/[0.08]";

/** Persistent selected-record wash — juniper-tinted border + wash, same language as hover. */
const CARD_SELECTED_CLASS =
    " border-alloy-juniper/40 bg-alloy-juniper/[0.06] hover:bg-alloy-juniper/[0.08]";

/** Persistent selected rail — marks the record currently open in the inline Focus Panel. */
function SelectedRail() {
    return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-alloy-juniper" />;
}

/** 32px circular subject chip — tinted background, subject initial. */
function AvatarChip({ name }: { name: string }) {
    const initial = name.trim().charAt(0).toUpperCase() || "•";
    return (
        <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alloy-juniper/10 text-[13px] font-semibold leading-none text-alloy-juniper"
        >
            {initial}
        </span>
    );
}

/** Line 2: primary contact and/or related subjects (e.g. children) from the frozen contract. */
function contactLine(context: RowContext): string | null {
    const parts: string[] = [];
    const contact = context.primary_contact?.display_name?.trim();
    if (contact) parts.push(contact);
    const related = context.related_subjects_summary
        .filter((subject) => subject.visibility !== "hidden")
        .map((subject) => subject.display_name.trim())
        .filter(Boolean);
    if (related.length) parts.push(related.join(", "));
    return parts.length ? parts.join(" · ") : null;
}

/** Grouped-row count chip label (e.g. "2 children") — only when the row is grouped. */
function groupedCountLabel(context: RowContext): string | null {
    if (context.row_presentation_mode !== "grouped_subjects") return null;
    const count = context.row_count ?? context.row_subjects?.length ?? null;
    if (count == null) return null;
    const unit = (context.row_count_unit ?? "records").replace(/_/g, " ");
    return `${count} ${unit}`;
}

/** A slot renders when config is absent or the config marks it visible. */
function slotVisible(slot: CompactRowSlots[keyof CompactRowSlots] | undefined): boolean {
    return slot?.visible !== false;
}

export function CondensedQueueRow({
    row,
    rowConfig,
    onOpen,
    onPrefetch,
    isFirst,
    isSelected,
}: {
    row: QueueRowModel;
    /**
     * Compact-slot config from the published Queue Row surface (visibility + label
     * overrides). Absent → pure generic-context rendering (all slots visible, no overrides).
     */
    rowConfig?: CompactRowSlots;
    onOpen: (row: QueueRowModel) => void;
    /**
     * Hover/focus intent — warm this row's Focus Panel record VM before the click so opening
     * is instant. Fires on pointer-enter and keyboard focus; fire-and-forget and deduped.
     */
    onPrefetch?: (row: QueueRowModel) => void;
    isFirst?: boolean;
    /** Row's record is the one open in the inline Focus Panel — persistent selected rail. */
    isSelected?: boolean;
}) {
    const context = row.context;
    // One warm handler for both pointer-enter (mouse intent) and focus (keyboard intent).
    const warm = onPrefetch ? () => onPrefetch(row) : undefined;
    const cardClass =
        CARD_BUTTON_CLASS + (isSelected ? CARD_SELECTED_CLASS : CARD_IDLE_CLASS);

    if (!context) {
        return (
            <button
                type="button"
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
                data-entity-id={row.entityId}
                data-entity-type={row.entityType}
                data-queue-row-first={isFirst ? "true" : undefined}
                data-queue-row-active={isSelected ? "true" : undefined}
                onPointerEnter={warm}
                onFocus={warm}
                onClick={() => onOpen(row)}
                className={cardClass}
            >
                {isSelected ? <SelectedRail /> : null}
                <span className="block min-w-0 truncate text-[13px] leading-4 text-alloy-midnight/70">
                    {row.entityId}
                </span>
            </button>
        );
    }

    // Per-slot visibility from the published surface (absent config → all visible). The
    // subject slot is the row's identity anchor and is always rendered; config visibility
    // gates only the secondary slots.
    const showStatus = slotVisible(rowConfig?.status);
    const showContact = slotVisible(rowConfig?.contact);
    const showAttention = slotVisible(rowConfig?.attention);
    const showWork = slotVisible(rowConfig?.work);
    const showGroupCount = slotVisible(rowConfig?.groupCount);

    const displayName = queueRowSubjectDisplayName(context);
    // Status pill: config label override where present, else the generic context value.
    const stageLabel = showStatus
        ? rowConfig?.status?.label ?? (context.row_status_label || context.row_stage)
        : null;
    const needsAttention = showAttention && context.attention_summary?.needs_attention === true;
    const attentionReason = needsAttention
        ? context.attention_summary?.primary_reason_label ?? null
        : null;
    const line2 = showContact ? contactLine(context) : null;
    const countChip = showGroupCount ? groupedCountLabel(context) : null;
    const workLabel = showWork
        ? context.current_work_summary?.label ??
          context.next_best_action?.label ??
          context.work_summary?.primary_open_label ??
          null
        : null;
    const dueLabel = showWork ? context.current_work_summary?.due_label ?? null : null;
    const hasFooterLine = countChip != null || workLabel != null || dueLabel != null;

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
            className={cardClass}
        >
            {isSelected ? <SelectedRail /> : null}
            <span className="flex items-start gap-2.5">
                <AvatarChip name={displayName} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-semibold leading-4 text-alloy-midnight">
                            {displayName}
                        </span>
                        {stageLabel ? (
                            <span className="max-w-[10rem] shrink-0 truncate rounded-full border border-alloy-midnight/15 bg-white px-2 py-0.5 text-[10px] font-semibold leading-[13px] text-alloy-midnight/60">
                                {stageLabel}
                            </span>
                        ) : null}
                    </span>
                    {line2 ? (
                        <span className="mt-0.5 block min-w-0 truncate text-[11px] leading-4 text-alloy-midnight/60">
                            {line2}
                        </span>
                    ) : null}
                    {needsAttention ? (
                        <span
                            className="mt-1 flex min-w-0 items-center gap-1.5"
                            title={attentionReason ?? undefined}
                        >
                            <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-ember"
                                aria-hidden
                            />
                            {attentionReason ? (
                                <span className="truncate text-[11px] font-semibold leading-4 text-alloy-ember">
                                    {attentionReason}
                                </span>
                            ) : (
                                <span className="sr-only">Needs attention</span>
                            )}
                        </span>
                    ) : null}
                    {hasFooterLine ? (
                        <span className="mt-1 flex items-baseline gap-2">
                            {countChip ? (
                                <span className="shrink-0 rounded-full border border-alloy-stone/25 bg-white px-2 py-0.5 text-[11px] leading-4 text-alloy-midnight/60">
                                    {countChip}
                                </span>
                            ) : null}
                            <span className="ml-auto flex min-w-0 shrink items-baseline gap-2">
                                {workLabel ? (
                                    <span className="max-w-[16rem] truncate text-[11px] leading-4 text-alloy-midnight/60">
                                        {workLabel}
                                    </span>
                                ) : null}
                                {dueLabel ? (
                                    <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-alloy-midnight/45">
                                        {dueLabel}
                                    </span>
                                ) : null}
                            </span>
                        </span>
                    ) : null}
                </span>
            </span>
        </button>
    );
}
