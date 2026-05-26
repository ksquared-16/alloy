"use client";

import clsx from "clsx";
import {
    INTAKE_WORKSPACE_FILTERS,
    type IntakeWorkspaceFilterKey,
} from "@/lib/forms/intakeWorkspaceFilters";

const TONE_CLASS: Record<IntakeWorkspaceFilterKey, string> = {
    needs_review: "ring-alloy-ember/25 bg-alloy-ember/[0.05]",
    needs_linking: "ring-amber-300/60 bg-amber-50/80",
    waiting: "ring-alloy-blue/20 bg-alloy-blue/[0.04]",
    forms: "ring-alloy-midnight/[0.08] bg-white/95",
    packets: "ring-alloy-midnight/[0.08] bg-white/95",
};

const ACTIVE_CLASS = "ring-2 ring-alloy-blue/40 shadow-sm";

type Props = {
    counts: Record<IntakeWorkspaceFilterKey, number>;
    selected: IntakeWorkspaceFilterKey;
    onSelect: (filter: IntakeWorkspaceFilterKey) => void;
    /** Vertical stack for side-by-side hub layout (FD-11). */
    stack?: boolean;
};

/** Interactive workload filters for intake command center (FD-1). */
export function IntakeWorkloadFilterStrip({ counts, selected, onSelect, stack = false }: Props) {
    return (
        <div
            className={clsx(
                stack ? "flex flex-col gap-1.5" : "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
            )}
            data-testid="intake-workload-filters"
            role="tablist"
            aria-label="Intake workload filters"
        >
            {INTAKE_WORKSPACE_FILTERS.map((f) => {
                const active = selected === f.id;
                const count = counts[f.id];
                return (
                    <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`intake-filter-${f.id}`}
                        className={clsx(
                            "rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all",
                            TONE_CLASS[f.id],
                            active && ACTIVE_CLASS,
                            "hover:opacity-95"
                        )}
                        onClick={() => onSelect(f.id)}
                    >
                        <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/65">
                            {f.label}
                        </p>
                        <p className="mt-0.5 text-xl font-semibold tabular-nums text-alloy-midnight">{count}</p>
                    </button>
                );
            })}
        </div>
    );
}
