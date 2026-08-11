"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE_ROW.
 *
 * The approved split-view queue CARD (staging parity — see the CompressedQueueRow
 * anatomy in adminV2 history). Rendered ONLY from the frozen `QueueRowContext` contract
 * (web/lib/workUnits/lifecycleSubjectContracts.ts):
 *
 *   [32px avatar]  line 1 subject identity ··············· [age] [stage pill]
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
import type { FocusedSubjectContext } from "@/lib/presentation/runtime/resolveQueueRowSubjectFocus";
import {
    resolveCompactSecondaryBand,
    resolveCompactSlotDisplay,
} from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { compactSlotsUsePublishedAuthority } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { useAcknowledgeOnActive } from "@/lib/motion/useMotionAcknowledge";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import {
    occurrenceKeyFromQueueRowContext,
    resolveRowUnseen,
    useLocallySeenOccurrenceCount,
} from "@/lib/queues/queuePersonalSeenSession";

const CARD_BUTTON_CLASS =
    `${QUEUE_ROW_CARD_SHELL_CLASS} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine`;

const CARD_IDLE_CLASS = ` ${QUEUE_ROW_CARD_IDLE_BORDER_CLASS}`;

const CARD_SELECTED_CLASS = ` ${QUEUE_ROW_CARD_SELECTED_BORDER_CLASS}`;

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
    focus,
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
    /** Row's record is the one open in the inline Focus Panel — perimeter + tint selected state. */
    isSelected?: boolean;
    /**
     * Resolved Subject Focus for this row's variant (Phase 3). When present, it decides WHICH
     * subject fills the identity/supporting/sibling slots — same slots, no new renderer. Absent →
     * pure frozen-context rendering (current behavior). Never invents data.
     */
    focus?: FocusedSubjectContext;
}) {
    const context = row.context;
    const { orgId, principalUserId } = useWorkspaceOrg();
    useLocallySeenOccurrenceCount();
    const occurrenceKey = occurrenceKeyFromQueueRowContext(context, principalUserId, orgId);
    const showUnseen = resolveRowUnseen({ context, occurrenceKey });
    // One warm handler for pointer-enter, pointer-down (earliest pre-click), and focus.
    // All route to the same existing `onPrefetch` (`intents.prefetchRecord`).
    const warm = onPrefetch
        ? () => {
              markPerceived("queue_row_open", "warm", {
                  entity_id: row.entityId,
                  entity_type: row.entityType,
                  warm_seam: "row_intent",
              });
              onPrefetch(row);
          }
        : undefined;
    // `acknowledge` choreography: a spring pulse the instant this row becomes the selected
    // record (false → true), confirming the open registered. Composes with `motion-control`
    // (transition) — the animation and the transition touch different CSS properties.
    const ack = useAcknowledgeOnActive(Boolean(isSelected));
    const cardClass =
        CARD_BUTTON_CLASS +
        (isSelected ? CARD_SELECTED_CLASS : CARD_IDLE_CLASS) +
        (ack.className ? ` ${ack.className}` : "");

    if (!context) {
        return (
            <button
                type="button"
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
                data-entity-id={row.entityId}
                data-entity-type={row.entityType}
                data-queue-row-first={isFirst ? "true" : undefined}
                data-queue-row-active={isSelected ? "true" : undefined}
                onPointerDown={warm}
                onPointerEnter={warm}
                onFocus={warm}
                onClick={() => onOpen(row)}
                className={cardClass}
            >
                <span className="block min-w-0 truncate text-[13px] leading-4 text-alloy-midnight/70">
                    {row.entityId}
                </span>
            </button>
        );
    }

    // Per-slot visibility from the published surface (absent config → all visible). The
    // subject slot is the row's identity anchor and is always rendered; config visibility
    // gates only the secondary slots. Under published authority, empty slots stay empty —
    // never substitute Lead Status / default contact-line fields.
    const publishedAuthority = compactSlotsUsePublishedAuthority(rowConfig);
    const showStatus = publishedAuthority
        ? Boolean(rowConfig?.status.fieldKeys?.length)
        : slotVisible(rowConfig?.status);
    const showContact = publishedAuthority
        ? Boolean(rowConfig?.contact.fieldKeys?.length)
        : slotVisible(rowConfig?.contact);
    const showAttention = publishedAuthority
        ? Boolean(rowConfig?.attention.fieldKeys?.length)
        : slotVisible(rowConfig?.attention);
    const showWork = publishedAuthority
        ? Boolean(rowConfig?.work.fieldKeys?.length)
        : slotVisible(rowConfig?.work);
    const showGroupCount = publishedAuthority
        ? Boolean(rowConfig?.groupCount.fieldKeys?.length)
        : slotVisible(rowConfig?.groupCount);

    // Subject Focus (Phase 3): the focused primary subject anchors the identity slot; its supporting
    // lines + sibling rollup feed the contact + group slots. All fall back to frozen-context values
    // when focus is absent or empty — never invents data, same slots, one renderer.
    const displayName =
        resolveCompactSlotDisplay("subject", context, rowConfig?.subject, focus, { publishedAuthority })
        ?? focus?.primary.display_name?.trim()
        ?? queueRowSubjectDisplayName(context);
    const stageLabel = showStatus
        ? resolveCompactSlotDisplay("status", context, rowConfig?.status, focus, { publishedAuthority })
        : null;
    const needsAttention = showAttention && context.attention_summary?.needs_attention === true;
    const attentionReason = needsAttention
        ? resolveCompactSlotDisplay("attention", context, rowConfig?.attention, focus, { publishedAuthority })
        : null;
    const line2 = showContact
        ? resolveCompactSlotDisplay("contact", context, rowConfig?.contact, focus, { publishedAuthority })
        : null;
    const secondaryBand = showGroupCount
        ? resolveCompactSecondaryBand(context, rowConfig?.groupCount, {
              publishedAuthority,
              focus: focus ?? null,
          })
        : null;
    const workLabel = showWork
        ? resolveCompactSlotDisplay("work", context, rowConfig?.work, focus, { publishedAuthority })
        : null;
    const dueLabel =
        showWork && !publishedAuthority
            ? context.current_work_summary?.blocker_hint
              ?? context.current_work_summary?.due_label
              ?? null
            : null;
    const hasWorkFooter = workLabel != null || dueLabel != null;
    const secondaryRendered = secondaryBand?.left || secondaryBand?.right || null;

    return (
        <button
            type="button"
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.queueRow)}
            data-entity-id={row.entityId}
            data-entity-type={row.entityType}
            data-queue-row-first={isFirst ? "true" : undefined}
            data-queue-row-active={isSelected ? "true" : undefined}
            data-needs-attention={needsAttention ? "true" : undefined}
            data-queue-row-vm-contact={rowConfig?.contact.fieldKeys?.join("|") || undefined}
            data-queue-row-vm-group={rowConfig?.groupCount.fieldKeys?.join("|") || undefined}
            data-queue-row-vm-work={rowConfig?.work.fieldKeys?.join("|") || undefined}
            data-queue-row-rendered-contact={line2 ?? undefined}
            data-queue-row-rendered-group={secondaryRendered ?? undefined}
            data-queue-row-has-secondary={secondaryBand ? "true" : undefined}
            onPointerDown={warm}
            onPointerEnter={warm}
            onFocus={warm}
            onClick={() => onOpen(row)}
            className={cardClass}
        >
            <span className="flex items-start gap-2.5">
                <AvatarChip name={displayName} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                            {showUnseen ? (
                                <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-juniper"
                                    aria-label="Not yet opened by you"
                                    title="Not yet opened by you"
                                />
                            ) : (
                                <span className="h-1.5 w-1.5 shrink-0" aria-hidden />
                            )}
                            <span
                                data-queue-row-subject
                                className="min-w-0 truncate text-[13px] font-semibold leading-4 text-alloy-midnight"
                            >
                                {displayName}
                            </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                            {context.operational_state?.age_compact ? (
                                <span
                                    data-queue-row-operational-age
                                    className="tabular-nums text-[11px] font-medium leading-4 text-alloy-midnight/55"
                                    title={
                                        context.operational_state.age_accessible
                                        ?? undefined
                                    }
                                    aria-label={
                                        context.operational_state.age_accessible
                                        ?? undefined
                                    }
                                >
                                    {context.operational_state.age_compact}
                                </span>
                            ) : null}
                            {stageLabel ? (
                                <span
                                    data-queue-row-stage
                                    className="max-w-[10rem] truncate rounded-full border border-alloy-pine/30 bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-semibold leading-[13px] text-alloy-pine"
                                >
                                    {stageLabel}
                                </span>
                            ) : null}
                        </span>
                    </span>
                    {line2 ? (
                        <span
                            data-queue-row-supporting
                            className="mt-0.5 block min-w-0 whitespace-normal break-words text-[11px] leading-4 text-alloy-midnight/60"
                            title={line2}
                        >
                            {line2}
                        </span>
                    ) : null}
                    {secondaryBand ? (
                        <span
                            data-queue-row-secondary
                            className="mt-0.5 flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-4 text-alloy-midnight/60"
                        >
                            {secondaryBand.left ? (
                                <span
                                    data-queue-row-secondary-left
                                    className="min-w-0 truncate"
                                    title={secondaryBand.left}
                                >
                                    {secondaryBand.left}
                                </span>
                            ) : (
                                <span />
                            )}
                            {secondaryBand.right ? (
                                <span
                                    data-queue-row-secondary-right
                                    data-queue-row-count
                                    className="shrink-0 whitespace-nowrap text-alloy-midnight/55"
                                    title={secondaryBand.right}
                                >
                                    {secondaryBand.right}
                                </span>
                            ) : null}
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
                    {hasWorkFooter ? (
                        <span className="mt-1 flex items-baseline gap-2" data-queue-row-work-footer>
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
