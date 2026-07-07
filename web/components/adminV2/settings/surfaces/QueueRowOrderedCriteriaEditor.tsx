"use client";

import type { ReactNode } from "react";

export type OrderedCriteriaRow = {
    id: string;
    label: string;
    unavailable?: boolean;
    unavailableNote?: string;
    trailing?: ReactNode;
};

export type QueueRowOrderedCriteriaEditorProps = {
    title: string;
    rows: OrderedCriteriaRow[];
    addLabel: string;
    addOptions: { value: string; label: string; disabled?: boolean }[];
    onAdd: (value: string) => void;
    onRemove: (index: number) => void;
    onReorder: (index: number, direction: -1 | 1) => void;
    emptyHint: string;
    testId: string;
};

export default function QueueRowOrderedCriteriaEditor({
    title,
    rows,
    addLabel,
    addOptions,
    onAdd,
    onRemove,
    onReorder,
    emptyHint,
    testId,
}: QueueRowOrderedCriteriaEditorProps) {
    return (
        <div className="min-w-[14rem] flex-1 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.02] p-3" data-testid={testId}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-alloy-midnight/70">{title}</p>
                <label className="flex items-center gap-1.5">
                    <span className="sr-only">{addLabel}</span>
                    <select
                        defaultValue=""
                        onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            onAdd(value);
                            e.target.value = "";
                        }}
                        className="rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight/75"
                        data-testid={`${testId}-add`}
                    >
                        <option value="">{addLabel}</option>
                        {addOptions.map((opt) => (
                            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {rows.length === 0 ? (
                <p className="text-[10px] text-alloy-midnight/45">{emptyHint}</p>
            ) : (
                <ol className="space-y-1.5" data-testid={`${testId}-list`}>
                    {rows.map((row, index) => (
                        <li
                            key={row.id}
                            className="flex items-center gap-2 rounded-md border border-alloy-stone/10 bg-white px-2 py-1.5"
                            data-testid={`${testId}-item`}
                            data-criterion-index={index}
                        >
                            <span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-alloy-midnight/35">{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-alloy-midnight/75">{row.label}</span>
                            {row.unavailable ? (
                                <span className="max-w-[8rem] shrink-0 text-right text-[9px] leading-tight text-amber-700">
                                    {row.unavailableNote ?? "Not available yet — missing registry field"}
                                </span>
                            ) : null}
                            {row.trailing}
                            <span className="flex shrink-0 gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => onReorder(index, -1)}
                                    disabled={index === 0}
                                    className="rounded px-1 text-[10px] text-alloy-midnight/45 hover:bg-alloy-stone/10 disabled:opacity-30"
                                    aria-label="Move up"
                                    data-testid={`${testId}-up`}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onReorder(index, 1)}
                                    disabled={index === rows.length - 1}
                                    className="rounded px-1 text-[10px] text-alloy-midnight/45 hover:bg-alloy-stone/10 disabled:opacity-30"
                                    aria-label="Move down"
                                    data-testid={`${testId}-down`}
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    className="rounded px-1 text-[10px] text-red-500 hover:bg-red-50"
                                    aria-label="Remove"
                                    data-testid={`${testId}-remove`}
                                >
                                    ✕
                                </button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
