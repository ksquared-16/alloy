"use client";

import { useCallback, useEffect, useState } from "react";
import WorkViewConditionValueControl from "@/components/adminV2/settings/businessProcess/WorkViewConditionValueControl";
import { ConfigRuntimeSectionHeader } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";
import { WORK_VIEW_FILTER_FIELD_OPTIONS } from "@/lib/lifecycle/workViewsConfigV1";
import {
    createDefaultWorkViewFilterRow,
    operatorLabelsForField,
    patchWorkViewFilterRow,
    type WorkViewFilterOption,
} from "@/lib/lifecycle/workViewFilterValueControls";
import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN } from "@/lib/lifecycle/businessProcessUiLabels";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type StatusOptionsResponse = { options?: { value: string; label: string }[] };
type LocationsResponse = {
    locations?: { id: string; label: string | null; name?: string | null }[];
};

export default function WorkViewConditionEditor({
    filters,
    onChange,
}: {
    filters: WorkViewFilterV1[];
    onChange: (filters: WorkViewFilterV1[]) => void;
}) {
    const [statusOptions, setStatusOptions] = useState<WorkViewFilterOption[]>([]);
    const [locationOptions, setLocationOptions] = useState<WorkViewFilterOption[]>([]);

    const loadOptions = useCallback(async () => {
        try {
            const [statusRes, locRes] = await Promise.all([
                fetch("/api/admin/status-options?entity_type=opportunities", workspaceDataFetchInit()),
                fetch("/api/admin/locations", workspaceDataFetchInit()),
            ]);
            const statusJson = (await statusRes.json()) as StatusOptionsResponse;
            const locJson = (await locRes.json()) as LocationsResponse;
            if (statusRes.ok) {
                setStatusOptions(
                    (statusJson.options ?? []).map((o) => ({ value: o.value, label: o.label })),
                );
            }
            if (locRes.ok) {
                setLocationOptions(
                    (locJson.locations ?? []).map((loc) => ({
                        value: loc.id,
                        label: (loc.label ?? loc.name ?? loc.id).trim() || loc.id,
                    })),
                );
            }
        } catch {
            /* keep empty — typed controls still render presets */
        }
    }, []);

    useEffect(() => {
        void loadOptions();
    }, [loadOptions]);

    const updateRow = (index: number, patch: Partial<WorkViewFilterV1>) => {
        onChange(
            filters.map((row, i) => (i === index ? patchWorkViewFilterRow(row, patch) : row)),
        );
    };

    const removeRow = (index: number) => {
        onChange(filters.filter((_, i) => i !== index));
    };

    const addRow = () => {
        onChange([...filters, createDefaultWorkViewFilterRow("tour_date")]);
    };

    return (
        <div className="space-y-3" data-testid="work-view-condition-editor">
            <ConfigRuntimeSectionHeader>{BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN}</ConfigRuntimeSectionHeader>
            <div className="space-y-2">
                {filters.map((row, index) => {
                    const operators = operatorLabelsForField(row.field_key);
                    return (
                        <div
                            key={`${row.field_key}-${index}`}
                            className="config-runtime-condition-row"
                            data-testid={`work-view-condition-row-${index}`}
                        >
                            <select
                                value={row.field_key}
                                onChange={(e) => updateRow(index, { field_key: e.target.value })}
                                className="config-runtime-select"
                                data-testid={`work-view-condition-field-${index}`}
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
                                className="config-runtime-select"
                                data-testid={`work-view-condition-operator-${index}`}
                            >
                                {operators.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <WorkViewConditionValueControl
                                fieldKey={row.field_key}
                                operator={row.operator}
                                value={row.value}
                                statusOptions={statusOptions}
                                locationOptions={locationOptions}
                                onChange={(value) => updateRow(index, { value })}
                                testId={`work-view-condition-value-${index}`}
                            />
                            <button
                                type="button"
                                onClick={() => removeRow(index)}
                                className="rounded-lg px-2 py-2 text-xs font-medium text-alloy-midnight/45 hover:bg-red-50 hover:text-red-700"
                                aria-label="Remove condition"
                                data-testid={`work-view-condition-remove-${index}`}
                            >
                                ✕
                            </button>
                        </div>
                    );
                })}
            </div>
            <button
                type="button"
                onClick={addRow}
                className="text-sm font-semibold text-alloy-pine hover:underline"
                data-testid="work-view-add-condition"
            >
                + Add condition
            </button>
        </div>
    );
}
