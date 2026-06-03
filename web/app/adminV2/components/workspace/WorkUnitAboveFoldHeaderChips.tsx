"use client";

import type {
    WorkUnitAboveFoldChip,
    WorkUnitAboveFoldChipCount,
    WorkUnitAboveFoldHeaderSlot,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";

export type WorkUnitAboveFoldHeaderHandlers = {
    onQueueTabChange: (queueKey: string, opts?: { unmappedActive?: boolean }) => void;
    onAttentionBucketSelect: (bucketKey: string | null) => void;
};

const PILL_BASE =
    "adminv2-ws-queue-pill-chip inline-flex min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug transition-colors";

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
    return selected
        ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]"
        : "border-admin-border bg-white/70 text-alloy-forge/80";
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
                selected ? "bg-alloy-forge/10 text-alloy-forge" : "bg-alloy-stone/15 text-alloy-forge/70"
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
};

/**
 * Queue header chips — final pill geometry from first paint; counts hydrate in place.
 */
export function WorkUnitAboveFoldHeaderChips({
    slot,
    handlers,
    otherPillSectionKey = null,
    lifecyclePanel = null,
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

    return (
        <div
            className="flex flex-col gap-1.5 min-w-0"
            data-wu-above-fold-slot="header"
            data-wu-above-fold-state={slot.state}
        >
            <div className="flex flex-col gap-1">
                {slot.sections.map((section) => (
                    <div key={section.key} className="flex min-w-0 flex-col gap-1">
                        {multiSection ? (
                            <span className="w-full text-[10px] font-semibold tracking-wide text-alloy-forge/50 sm:w-auto sm:mr-1">
                                {section.label}
                            </span>
                        ) : null}
                        <div
                            className="adminv2-ws-queue-pill-scroll adminv2-ws-queue-pill-scroll--distributed"
                            role="group"
                            aria-label={section.label}
                        >
                            {section.chips.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
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
                                    className={`${PILL_BASE} ${tierRing(chip.priority, chip.selected)}`}
                                    aria-pressed={chip.selected}
                                    title={chip.count_aria_label ?? chip.description}
                                >
                                    <span className="adminv2-ws-queue-pill-chip__label">{chip.label}</span>
                                    <CountBadge
                                        count={chip.count}
                                        selected={chip.selected}
                                        countsDeferred={chip.counts_deferred}
                                        countAriaLabel={chip.count_aria_label}
                                    />
                                </button>
                            ))}
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
                                    className={`${PILL_BASE} ${
                                        slot.other_pill.selected
                                            ? "border-alloy-blue bg-alloy-blue/[0.07] text-alloy-forge shadow-[inset_0_0_0_1px_rgba(0,69,140,0.12)]"
                                            : "border-admin-border bg-white/70 text-alloy-forge/80"
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
