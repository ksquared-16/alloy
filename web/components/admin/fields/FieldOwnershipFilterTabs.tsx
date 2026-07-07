"use client";

import type { FieldOwnershipKind } from "@/lib/fields/fieldOwnership";
import { FIELD_OWNERSHIP_LABELS } from "@/lib/fields/fieldOwnership";

export type FieldOwnershipFilter = FieldOwnershipKind | "all";

type Props = {
    value: FieldOwnershipFilter;
    onChange: (next: FieldOwnershipFilter) => void;
    counts: { all: number; platform: number; custom: number; computed: number };
};

const FILTERS: FieldOwnershipFilter[] = ["all", "platform", "custom", "computed"];

const FILTER_LABELS: Record<FieldOwnershipFilter, string> = {
    all: "All",
    ...FIELD_OWNERSHIP_LABELS,
};

export default function FieldOwnershipFilterTabs({ value, onChange, counts }: Props) {
    return (
        <div className="flex flex-wrap gap-2" data-testid="field-ownership-filter-tabs" role="tablist">
            {FILTERS.map((filter) => {
                const active = value === filter;
                const count = counts[filter];
                return (
                    <button
                        key={filter}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(filter)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            active
                                ? "border-alloy-pine/40 bg-alloy-pine/[0.1] text-alloy-pine"
                                : "border-alloy-forge/15 bg-white text-alloy-midnight/65 hover:border-alloy-forge/25"
                        }`}
                        data-ownership-filter={filter}
                    >
                        {FILTER_LABELS[filter]}
                        <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
                    </button>
                );
            })}
        </div>
    );
}
