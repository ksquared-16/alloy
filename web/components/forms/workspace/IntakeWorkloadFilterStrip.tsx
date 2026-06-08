"use client";

import clsx from "clsx";
import {
    INTAKE_WORKSPACE_FILTERS,
    type IntakeWorkspaceFilterKey,
} from "@/lib/forms/intakeWorkspaceFilters";

type Props = {
    counts: Record<IntakeWorkspaceFilterKey, number>;
    selected: IntakeWorkspaceFilterKey;
    onSelect: (filter: IntakeWorkspaceFilterKey) => void;
};

/** Workload filter rail — command-center tabs (FD-12). */
export function IntakeWorkloadFilterStrip({ counts, selected, onSelect }: Props) {
    return (
        <div
            className="rounded-xl bg-alloy-stone/35 p-1.5 ring-1 ring-alloy-midnight/[0.07]"
            data-testid="intake-workload-filters-wrap"
        >
            <div
                className="flex flex-wrap gap-1"
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
                                "rounded-lg px-3 py-2 text-left transition-colors",
                                active ?
                                    "bg-white font-medium text-alloy-midnight shadow-[0_1px_2px_rgba(49,57,77,0.06)] ring-1 ring-alloy-blue/25"
                                :   "text-alloy-midnight/70 hover:bg-white/60 hover:text-alloy-midnight"
                            )}
                            onClick={() => onSelect(f.id)}
                        >
                            <span className="text-xs">{f.shortLabel}</span>
                            <span
                                className={clsx(
                                    "ml-1.5 tabular-nums",
                                    active ? "font-semibold text-alloy-blue" : "text-alloy-midnight/55"
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
