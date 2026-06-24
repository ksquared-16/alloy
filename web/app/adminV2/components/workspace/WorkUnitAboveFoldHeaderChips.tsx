"use client";

import { useMemo } from "react";
import type {
    WorkUnitAboveFoldChip,
    WorkUnitAboveFoldChipCount,
    WorkUnitAboveFoldHeaderSlot,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { computeEqualStagePillGrid } from "@/lib/workspace/stagePillEqualWidth";

export type WorkUnitAboveFoldHeaderHandlers = {
    onQueueTabChange: (queueKey: string, opts?: { unmappedActive?: boolean }) => void;
    onAttentionBucketSelect: (bucketKey: string | null) => void;
    /** Hover/focus/mousedown warm for a lane pill before click. */
    onQueuePillIntent?: (queueKey: string, opts?: { unmappedActive?: boolean }) => void;
};

const PILL_BASE =
    "adminv2-ws-queue-pill-chip inline-flex min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug transition-colors";

const PILL_INLINE =
    "adminv2-ws-queue-pill-chip adminv2-ws-queue-pill-chip--inline-command inline-flex min-w-0 max-w-none shrink-0 items-center justify-between gap-1 rounded-lg border px-2 py-1 text-left text-[11px] font-semibold leading-snug transition-colors";

const PILL_SELECTED_INLINE =
    "border-alloy-juniper bg-alloy-juniper text-white shadow-none";
const PILL_INACTIVE_INLINE = "border-alloy-midnight/15 bg-white text-alloy-midnight/75";

const PILL_SELECTED_BRAND =
    "border-alloy-juniper/55 bg-alloy-juniper/14 text-alloy-forge shadow-none";
const PILL_INACTIVE = "border-admin-border bg-white/85 text-alloy-forge/80";

function tierRing(tier: WorkUnitAboveFoldChip["priority"], selected: boolean): string {
    if (tier === "critical") {
        return selected
            ? "border-alloy-ember bg-alloy-ember/12 text-alloy-forge"
            : "border-alloy-ember/35 bg-white/60 text-alloy-forge/85";
    }
    if (tier === "attention") {
        return selected
            ? "border-alloy-honey bg-alloy-honey/12 text-alloy-forge"
            : "border-alloy-honey/40 bg-white/60 text-alloy-forge/85";
    }
    return selected ? PILL_SELECTED_BRAND : PILL_INACTIVE;
}

function inlinePillRing(tier: WorkUnitAboveFoldChip["priority"], selected: boolean): string {
    if (!selected) return PILL_INACTIVE_INLINE;
    if (tier === "critical") return "border-alloy-ember bg-alloy-ember text-white";
    if (tier === "attention") return "border-alloy-honey bg-alloy-honey text-alloy-forge";
    return PILL_SELECTED_INLINE;
}

function CountBadge({
    count,
    selected,
    countsDeferred,
    countAriaLabel,
}: {
    count: WorkUnitAboveFoldChipCount;
    selected: boolean;
    countsDeferred?: boolean;
    countAriaLabel?: string;
}) {
    if (count === "skeleton") {
        return (
            <span
                className="inline-block h-3 w-5 shrink-0 rounded skeleton-pulse bg-alloy-stone/14"
                aria-hidden
            />
        );
    }
    const display = count === "emdash" ? "—" : count;
    return (
        <span
            className={`inline-flex shrink-0 items-baseline gap-0.5 tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                selected
                    ? "bg-white/20 text-inherit"
                    : "bg-alloy-stone/15 text-alloy-forge/70"
            }`}
            aria-label={
                countAriaLabel ??
                (countsDeferred && count === "emdash" ? "Count unavailable" : undefined)
            }
        >
            <span>{display}</span>
        </span>
    );
}

type Props = {
    slot: WorkUnitAboveFoldHeaderSlot;
    handlers: WorkUnitAboveFoldHeaderHandlers;
    otherPillSectionKey?: string | null;
    lifecyclePanel?: React.ReactNode;
    /** Pill key showing inline pending while cold lane payload loads. */
    queuePillPendingKey?: string | null;
    /** Inline row beside process label (work-unit unified header). */
    layout?: "stacked" | "inline";
};

/**
 * Queue header chips — final pill geometry from first paint; counts hydrate in place.
 */
export function WorkUnitAboveFoldHeaderChips({
    slot,
    handlers,
    otherPillSectionKey = null,
    lifecyclePanel = null,
    queuePillPendingKey = null,
    layout = "stacked",
}: Props) {
    if (!slot.visible) return null;

    if (slot.error_message) {
        return (
            <div
                className="rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-sm text-alloy-ember"
                data-wu-above-fold-slot="header"
                data-wu-above-fold-state="ready"
            >
                {slot.error_message}
            </div>
        );
    }

    const multiSection = slot.sections.length > 1;

    const inline = layout === "inline";
    const pillClass = inline ? PILL_INLINE : PILL_BASE;

    const otherPill = slot.other_pill;

    const showOtherPill =
        inline &&
        Boolean(slot.show_other_pill && otherPill && otherPillSectionKey) &&
        slot.sections.some((section) => section.key === otherPillSectionKey);

    const pillLabels = useMemo(() => {
        if (!inline) return [] as string[];
        const labels = slot.sections.flatMap((section) => section.chips.map((chip) => chip.label));
        if (showOtherPill) labels.push("Other");
        return labels;
    }, [inline, showOtherPill, slot.sections]);

    const equalPillGrid = useMemo(() => computeEqualStagePillGrid(pillLabels), [pillLabels]);

    const renderChipButton = (chip: WorkUnitAboveFoldChip) => {
        const pillPending = queuePillPendingKey != null && queuePillPendingKey === chip.key;
        return (
            <button
                key={chip.key}
                type="button"
                onMouseEnter={() => {
                    if (chip.attention_placeholder) return;
                    if (chip.synthetic_attention_bucket) return;
                    handlers.onQueuePillIntent?.(chip.key);
                }}
                onFocus={() => {
                    if (chip.attention_placeholder) return;
                    if (chip.synthetic_attention_bucket) return;
                    handlers.onQueuePillIntent?.(chip.key);
                }}
                onMouseDown={() => {
                    if (chip.attention_placeholder) return;
                    if (chip.synthetic_attention_bucket) return;
                    handlers.onQueuePillIntent?.(chip.key);
                }}
                onClick={() => {
                    if (chip.attention_placeholder) return;
                    if (chip.synthetic_attention_bucket) {
                        handlers.onAttentionBucketSelect(chip.attention_bucket_raw_key ?? null);
                        return;
                    }
                    handlers.onQueueTabChange(chip.key);
                }}
                disabled={chip.attention_placeholder === true}
                aria-disabled={chip.attention_placeholder === true}
                aria-busy={pillPending ? true : undefined}
                data-queue-pill-open-pending={pillPending ? "true" : undefined}
                className={`${pillClass} ${inline ? inlinePillRing(chip.priority, chip.selected) : tierRing(chip.priority, chip.selected)}`}
                aria-pressed={chip.selected}
                title={chip.count_aria_label ?? chip.description}
            >
                <span className="adminv2-ws-queue-pill-chip__label">
                    {chip.label}
                    {pillPending ?
                        <span className="ml-1 text-[10px] font-medium text-alloy-midnight/50">…</span>
                    :   null}
                </span>
                <CountBadge
                    count={chip.count}
                    selected={chip.selected}
                    countsDeferred={chip.counts_deferred}
                    countAriaLabel={chip.count_aria_label}
                />
            </button>
        );
    };

    if (inline) {
        return (
            <div
                className="flex min-w-0 items-center gap-1"
                data-wu-above-fold-slot="header"
                data-wu-above-fold-state={slot.state}
                data-wu-header-chips-layout="inline"
            >
                <div
                    className="adminv2-ws-queue-pill-scroll adminv2-ws-queue-pill-scroll--inline-command adminv2-ws-queue-pill-scroll--equal-width"
                    role="group"
                    aria-label="Stages"
                    style={{ gridTemplateColumns: equalPillGrid.gridTemplateColumns }}
                    data-ws-stage-pill-count={equalPillGrid.pillCount}
                >
                    {slot.sections.flatMap((section) => section.chips.map((chip) => renderChipButton(chip)))}
                    {showOtherPill && otherPill ?
                            <button
                                type="button"
                                key="__derived_other__"
                                onClick={() =>
                                    handlers.onQueueTabChange(otherPill.all_records_queue_key, {
                                        unmappedActive: true,
                                    })
                                }
                                className={`${pillClass} ${
                                    otherPill.selected ? PILL_SELECTED_INLINE : PILL_INACTIVE_INLINE
                                }`}
                                aria-pressed={otherPill.selected}
                            >
                                <span className="adminv2-ws-queue-pill-chip__label">Other</span>
                                <span
                                    className={`tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                                        otherPill.selected
                                            ? "bg-white/20 text-inherit"
                                            : "bg-alloy-stone/15 text-alloy-forge/70"
                                    }`}
                                >
                                    {otherPill.count === "emdash" ? "—" : otherPill.count}
                                </span>
                            </button>
                    :   null}
                </div>
                {slot.state === "ready" && lifecyclePanel ?
                    <div className="shrink-0">{lifecyclePanel}</div>
                :   null}
            </div>
        );
    }

    return (
        <div
            className={inline ? "min-w-0" : "flex flex-col gap-1.5 min-w-0"}
            data-wu-above-fold-slot="header"
            data-wu-above-fold-state={slot.state}
            data-wu-header-chips-layout={layout}
        >
            <div className={inline ? "min-w-0" : "flex flex-col gap-1"}>
                {slot.sections.map((section) => (
                    <div
                        key={section.key}
                        className={inline ? "flex min-w-0 items-center gap-1" : "flex min-w-0 flex-col gap-1"}
                    >
                        {multiSection && !inline ? (
                            <span className="w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1">
                                {section.label}
                            </span>
                        ) : null}
                        <div
                            className={`adminv2-ws-queue-pill-scroll ${inline ? "" : "adminv2-ws-queue-pill-scroll--distributed"}`}
                            role="group"
                            aria-label={section.label}
                        >
                            {section.chips.map((chip) => {
                                const pillPending =
                                    queuePillPendingKey != null && queuePillPendingKey === chip.key;
                                return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onMouseEnter={() => {
                                        if (chip.attention_placeholder) return;
                                        if (chip.synthetic_attention_bucket) return;
                                        handlers.onQueuePillIntent?.(chip.key);
                                    }}
                                    onFocus={() => {
                                        if (chip.attention_placeholder) return;
                                        if (chip.synthetic_attention_bucket) return;
                                        handlers.onQueuePillIntent?.(chip.key);
                                    }}
                                    onMouseDown={() => {
                                        if (chip.attention_placeholder) return;
                                        if (chip.synthetic_attention_bucket) return;
                                        handlers.onQueuePillIntent?.(chip.key);
                                    }}
                                    onClick={() => {
                                        if (chip.attention_placeholder) return;
                                        if (chip.synthetic_attention_bucket) {
                                            handlers.onAttentionBucketSelect(chip.attention_bucket_raw_key ?? null);
                                            return;
                                        }
                                        handlers.onQueueTabChange(chip.key);
                                    }}
                                    disabled={chip.attention_placeholder === true}
                                    aria-disabled={chip.attention_placeholder === true}
                                    aria-busy={pillPending ? true : undefined}
                                    data-queue-pill-open-pending={pillPending ? "true" : undefined}
                                    className={`${pillClass} ${tierRing(chip.priority, chip.selected)}`}
                                    aria-pressed={chip.selected}
                                    title={chip.count_aria_label ?? chip.description}
                                >
                                    <span className="adminv2-ws-queue-pill-chip__label">
                                        {chip.label}
                                        {pillPending ?
                                            <span className="ml-1 text-[10px] font-medium text-alloy-midnight/50">
                                                …
                                            </span>
                                        :   null}
                                    </span>
                                    <CountBadge
                                        count={chip.count}
                                        selected={chip.selected}
                                        countsDeferred={chip.counts_deferred}
                                        countAriaLabel={chip.count_aria_label}
                                    />
                                </button>
                            );
                            })}
                            {slot.show_other_pill &&
                            slot.other_pill &&
                            section.key === otherPillSectionKey ? (
                                <button
                                    type="button"
                                    key="__derived_other__"
                                    onClick={() =>
                                        handlers.onQueueTabChange(slot.other_pill!.all_records_queue_key, {
                                            unmappedActive: true,
                                        })
                                    }
                                    className={`${pillClass} ${
                                        slot.other_pill.selected ? PILL_SELECTED_BRAND : PILL_INACTIVE
                                    }`}
                                    aria-pressed={slot.other_pill.selected}
                                >
                                    <span className="adminv2-ws-queue-pill-chip__label">Other</span>
                                    <span
                                        className={`tabular-nums rounded-full px-1 py-px text-[10px] font-bold ${
                                            slot.other_pill.selected
                                                ? "bg-alloy-forge/10 text-alloy-forge"
                                                : "bg-alloy-stone/15 text-alloy-forge/70"
                                        }`}
                                    >
                                        {slot.other_pill.count === "emdash" ? "—" : slot.other_pill.count}
                                    </span>
                                </button>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
            {slot.state === "ready" && lifecyclePanel ? (
                <div className="min-w-0">{lifecyclePanel}</div>
            ) : null}
        </div>
    );
}

export { WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX };
