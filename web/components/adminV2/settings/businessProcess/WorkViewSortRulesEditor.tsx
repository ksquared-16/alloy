"use client";

import {
    WORK_VIEW_SORT_FIELD_OPTIONS,
    type WorkViewSortV1,
} from "@/lib/lifecycle/workViewsConfigV1";

export function normalizeWorkViewSorts(
    sortV1: WorkViewSortV1 | undefined,
    sortsV1: WorkViewSortV1[] | undefined,
): WorkViewSortV1[] {
    if (sortsV1?.length) return sortsV1;
    if (sortV1?.field_key) return [sortV1];
    return [{ field_key: "updated_at", direction: "desc" }];
}

export function syncSortFields(
    sorts: WorkViewSortV1[],
): { sort_v1: WorkViewSortV1; sorts_v1: WorkViewSortV1[] } {
    const normalized = sorts.length ? sorts : [{ field_key: "updated_at", direction: "desc" as const }];
    return { sort_v1: normalized[0]!, sorts_v1: normalized };
}

export default function WorkViewSortRulesEditor({
    sorts,
    onChange,
    testIdPrefix,
}: {
    sorts: WorkViewSortV1[];
    onChange: (sorts: WorkViewSortV1[]) => void;
    testIdPrefix: string;
}) {
    const updateRow = (index: number, patch: Partial<WorkViewSortV1>) => {
        onChange(sorts.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const removeRow = (index: number) => {
        if (sorts.length <= 1) return;
        onChange(sorts.filter((_, i) => i !== index));
    };

    const moveRow = (index: number, delta: -1 | 1) => {
        const next = index + delta;
        if (next < 0 || next >= sorts.length) return;
        const copy = [...sorts];
        const [row] = copy.splice(index, 1);
        copy.splice(next, 0, row!);
        onChange(copy);
    };

    return (
        <div className="space-y-2" data-testid={`${testIdPrefix}-multi-sort`}>
            {sorts.map((row, index) => (
                <div
                    key={`sort-${index}-${row.field_key}`}
                    className="config-runtime-condition-row !grid-cols-1 sm:!grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    data-testid={`${testIdPrefix}-sort-row-${index}`}
                >
                    <select
                        value={row.field_key}
                        onChange={(e) => updateRow(index, { field_key: e.target.value })}
                        className="config-runtime-select"
                        data-testid={`${testIdPrefix}-sort-field-${index}`}
                    >
                        {WORK_VIEW_SORT_FIELD_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <select
                        value={row.direction}
                        onChange={(e) =>
                            updateRow(index, { direction: e.target.value as "asc" | "desc" })
                        }
                        className="config-runtime-select"
                        data-testid={`${testIdPrefix}-sort-direction-${index}`}
                    >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                    </select>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveRow(index, -1)}
                            className="rounded border border-alloy-stone/40 px-2 py-1 text-[10px] text-alloy-midnight/60 disabled:opacity-30"
                            aria-label="Move sort up"
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            disabled={index === sorts.length - 1}
                            onClick={() => moveRow(index, 1)}
                            className="rounded border border-alloy-stone/40 px-2 py-1 text-[10px] text-alloy-midnight/60 disabled:opacity-30"
                            aria-label="Move sort down"
                        >
                            ↓
                        </button>
                    </div>
                    <button
                        type="button"
                        disabled={sorts.length <= 1}
                        onClick={() => removeRow(index)}
                        className="rounded px-2 py-1 text-xs text-alloy-midnight/45 hover:text-red-700 disabled:opacity-30"
                        data-testid={`${testIdPrefix}-sort-remove-${index}`}
                    >
                        Remove
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() =>
                    onChange([
                        ...sorts,
                        {
                            field_key: "updated_at",
                            direction: sorts[sorts.length - 1]?.direction === "asc" ? "desc" : "asc",
                        },
                    ])
                }
                className="text-sm font-semibold text-alloy-pine hover:underline"
                data-testid={`${testIdPrefix}-add-sort`}
            >
                + Add sort rule
            </button>
        </div>
    );
}
