"use client";

import {
    WORK_VIEW_FILTER_FIELD_OPTIONS,
    WORK_VIEW_FILTER_OPERATOR_OPTIONS,
    type WorkViewFilterOperatorV1,
    type WorkViewFilterV1,
} from "@/lib/lifecycle/workViewsConfigV1";
import { BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN } from "@/lib/lifecycle/businessProcessUiLabels";

export default function WorkViewConditionEditor({
    filters,
    onChange,
}: {
    filters: WorkViewFilterV1[];
    onChange: (filters: WorkViewFilterV1[]) => void;
}) {
    const updateRow = (index: number, patch: Partial<WorkViewFilterV1>) => {
        onChange(filters.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const removeRow = (index: number) => {
        onChange(filters.filter((_, i) => i !== index));
    };

    const addRow = () => {
        onChange([...filters, { field_key: "status", operator: "equals", value: "" }]);
    };

    return (
        <div className="space-y-2" data-testid="work-view-condition-editor">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                {BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN}
            </p>
            <div className="space-y-2">
                {filters.map((row, index) => (
                    <div
                        key={`${row.field_key}-${index}`}
                        className="grid gap-2 rounded-xl border border-alloy-forge/10 bg-[#FAFBFC] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                        data-testid={`work-view-condition-row-${index}`}
                    >
                        <select
                            value={row.field_key}
                            onChange={(e) => updateRow(index, { field_key: e.target.value })}
                            className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                        >
                            {WORK_VIEW_FILTER_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={row.operator}
                            onChange={(e) =>
                                updateRow(index, { operator: e.target.value as WorkViewFilterOperatorV1 })
                            }
                            className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                        >
                            {WORK_VIEW_FILTER_OPERATOR_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={typeof row.value === "string" ? row.value : String(row.value ?? "")}
                            onChange={(e) => updateRow(index, { value: e.target.value })}
                            placeholder="Value"
                            className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="rounded-lg px-2 py-2 text-xs text-alloy-midnight/45 hover:bg-red-50 hover:text-red-700"
                            aria-label="Remove condition"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={addRow}
                className="text-sm font-medium text-alloy-pine hover:underline"
                data-testid="work-view-add-condition"
            >
                + Add condition
            </button>
        </div>
    );
}
