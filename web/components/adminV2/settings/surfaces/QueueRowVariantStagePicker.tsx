"use client";

import { useEffect, useRef, useState } from "react";

export type ProcessStageOption = { value: string; label: string };

export type QueueRowVariantStagePickerProps = {
    stages: readonly ProcessStageOption[];
    selectedStageKeys: readonly string[];
    onChange: (stageKeys: string[]) => void;
    loading?: boolean;
};

export default function QueueRowVariantStagePicker({
    stages,
    selectedStageKeys,
    onChange,
    loading = false,
}: QueueRowVariantStagePickerProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = new Set(selectedStageKeys);

    useEffect(() => {
        if (!open) return;
        function onDocClick(e: MouseEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    function toggle(stageKey: string, checked: boolean) {
        const next = new Set(selectedStageKeys);
        if (checked) next.add(stageKey);
        else next.delete(stageKey);
        onChange([...next]);
    }

    const selectedLabels = selectedStageKeys
        .map((k) => stages.find((s) => s.value === k)?.label ?? k)
        .filter(Boolean);

    const triggerLabel =
        selectedLabels.length === 0
            ? "Select stages…"
            : selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`;

    if (loading) {
        return <div className="h-9 animate-pulse rounded-md bg-alloy-stone/10" data-testid="queue-row-stage-picker-loading" />;
    }

    if (stages.length === 0) {
        return (
            <p className="text-[12px] text-alloy-midnight/50" data-testid="queue-row-stage-picker-empty">
                No process stages configured for this business process yet.
            </p>
        );
    }

    return (
        <div ref={rootRef} className="relative" data-testid="queue-row-variant-stage-picker">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="listbox"
                data-stage-dropdown-trigger
                className="flex w-full items-center justify-between gap-2 rounded-md border border-alloy-stone/25 bg-white px-2.5 py-2 text-left text-[12px] text-alloy-midnight/80 hover:border-alloy-pine/35"
            >
                <span className="truncate">{triggerLabel}</span>
                <span className="shrink-0 text-alloy-midnight/40">{open ? "▴" : "▾"}</span>
            </button>
            {open ? (
                <div
                    role="listbox"
                    aria-multiselectable
                    className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-alloy-stone/20 bg-white py-1 shadow-lg"
                    data-stage-dropdown-panel
                >
                    {stages.map((stage) => {
                        const checked = selected.has(stage.value);
                        return (
                            <label
                                key={stage.value}
                                className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-alloy-pine/[0.05]"
                                data-stage-option={stage.value}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => toggle(stage.value, e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-alloy-stone/30 text-alloy-pine focus:ring-alloy-pine/30"
                                    data-stage-checkbox={stage.value}
                                />
                                <span className="text-[12px] text-alloy-midnight/85">{stage.label}</span>
                            </label>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/** Summarize stage rules for variant tabs — labels only, never raw keys. */
export function formatVariantStageRuleSummary(
    stageKeys: readonly string[] | undefined,
    stages: readonly ProcessStageOption[],
): string {
    const keys = stageKeys ?? [];
    if (keys.length === 0) return "Any stage";
    const labels = keys.map((k) => stages.find((s) => s.value === k)?.label ?? k);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}
