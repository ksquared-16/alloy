"use client";

/**
 * Automation Rule condition rows for Tour communications.
 * Reuses Work View field defs + value control + filters_v1 shape.
 * Does NOT mount WorkViewConditionEditor (requires Work Views configuration context).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import WorkViewConditionValueControl from "@/components/adminV2/settings/businessProcess/WorkViewConditionValueControl";
import {
    createDefaultWorkViewFilterRow,
    operatorLabelsForField,
    patchWorkViewFilterRow,
    type WorkViewFilterOption,
} from "@/lib/lifecycle/workViewFilterValueControls";
import { getWorkViewConditionFieldDef } from "@/lib/lifecycle/workViewCanonicalOperands";
import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import {
    tourAutomationConditionFieldDefs,
} from "@/lib/tours/comms/tourCommsAutomationConditions";
import { lifecycleCatalogFetchInit, workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type LifecycleCatalogItem = {
    department_id?: string;
    process_id?: string;
    department_key?: string;
    process_key?: string;
    lifecycle_name?: string;
    stage_count?: number;
};

type LocationsResponse = {
    locations?: Array<{ id: string; label?: string | null; name?: string | null }>;
};

type StatusOptionsResponse = { options?: { value: string; label: string }[] };

type Props = {
    conditions: WorkViewFilterV1[];
    disabled?: boolean;
    onChange: (next: WorkViewFilterV1[]) => void;
};

function pickProcessForStages(items: LifecycleCatalogItem[]): LifecycleCatalogItem | null {
    const withStages = items.filter(
        (i) =>
            typeof i.department_id === "string"
            && i.department_id.trim()
            && typeof i.process_id === "string"
            && i.process_id.trim()
            && (typeof i.stage_count !== "number" || i.stage_count > 0),
    );
    if (!withStages.length) return null;
    const enrollment =
        withStages.find((i) => String(i.process_key ?? "").toLowerCase() === "enrollment")
        ?? withStages.find((i) => String(i.department_key ?? "").toLowerCase() === "enrollment")
        ?? withStages.find((i) => /enroll/i.test(String(i.lifecycle_name ?? "")));
    return enrollment ?? withStages[0] ?? null;
}

export default function AutomationRuleConditionEditor({
    conditions,
    disabled = false,
    onChange,
}: Props) {
    const fieldDefs = useMemo(() => tourAutomationConditionFieldDefs(), []);
    const [stageOptions, setStageOptions] = useState<WorkViewFilterOption[]>([]);
    const [siteOptions, setSiteOptions] = useState<WorkViewFilterOption[]>([]);
    const [opportunityStatusOptions, setOpportunityStatusOptions] = useState<WorkViewFilterOption[]>([]);

    const loadOptions = useCallback(async () => {
        try {
            const [catalogRes, siteRes, statusRes] = await Promise.all([
                fetch("/api/admin/lifecycle-catalog", lifecycleCatalogFetchInit()),
                fetch("/api/admin/locations?location_type=site", workspaceDataFetchInit()),
                fetch("/api/admin/status-options?entity_type=opportunities", workspaceDataFetchInit()),
            ]);

            if (siteRes.ok) {
                const json = (await siteRes.json()) as LocationsResponse;
                setSiteOptions(
                    (json.locations ?? []).map((loc) => ({
                        value: loc.id,
                        label: (loc.label ?? loc.name ?? loc.id).trim() || loc.id,
                    })),
                );
            }
            if (statusRes.ok) {
                const json = (await statusRes.json()) as StatusOptionsResponse;
                setOpportunityStatusOptions(
                    (json.options ?? []).map((o) => ({ value: o.value, label: o.label })),
                );
            }

            if (catalogRes.ok) {
                const catalogJson = (await catalogRes.json()) as { items?: LifecycleCatalogItem[] };
                const process = pickProcessForStages(catalogJson.items ?? []);
                if (process?.department_id && process.process_id) {
                    const params = new URLSearchParams({
                        department_id: process.department_id,
                        process_id: process.process_id,
                    });
                    const stagesRes = await fetch(
                        `/api/admin/lifecycle-builder/process-work-views?${params.toString()}`,
                        workspaceDataFetchInit(),
                    );
                    if (stagesRes.ok) {
                        const stagesJson = (await stagesRes.json()) as {
                            stages?: WorkViewFilterOption[];
                        };
                        setStageOptions(
                            (stagesJson.stages ?? []).map((s) => ({
                                value: String(s.value ?? "").trim(),
                                label: String(s.label ?? s.value ?? "").trim() || String(s.value ?? ""),
                            })).filter((s) => s.value),
                        );
                    }
                }
            }
        } catch {
            /* keep empty — selects still render */
        }
    }, []);

    useEffect(() => {
        void loadOptions();
    }, [loadOptions]);

    const optionsForField = useCallback(
        (fieldKey: string): readonly WorkViewFilterOption[] => {
            const source = getWorkViewConditionFieldDef(fieldKey)?.optionSource;
            if (!source) return [];
            switch (source.kind) {
                case "process_stages":
                    return stageOptions;
                case "locations":
                    return siteOptions;
                case "status_definitions":
                    return opportunityStatusOptions;
                case "boolean":
                    return [
                        { value: "true", label: "True" },
                        { value: "false", label: "False" },
                    ];
                default:
                    return [];
            }
        },
        [opportunityStatusOptions, siteOptions, stageOptions],
    );

    const updateRow = (index: number, patch: Partial<WorkViewFilterV1>) => {
        onChange(conditions.map((row, i) => (i === index ? patchWorkViewFilterRow(row, patch) : row)));
    };

    const removeRow = (index: number) => {
        onChange(conditions.filter((_, i) => i !== index));
    };

    const addRow = () => {
        const defaultKey = fieldDefs[0]?.key ?? "opportunity_stage";
        onChange([...conditions, createDefaultWorkViewFilterRow(defaultKey)]);
    };

    return (
        <div className="flex flex-col gap-2" data-automation-conditions="true">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-alloy-midnight/55">Conditions</span>
                <span className="text-[10px] text-alloy-midnight/45">All must match (AND)</span>
            </div>

            {conditions.length === 0 ? (
                <p
                    className="rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.03] px-2.5 py-2 text-[11px] text-alloy-midnight/55"
                    data-automation-conditions-empty="true"
                >
                    No conditions — this rule runs whenever the trigger and timing qualify.
                </p>
            ) : (
                <div className="space-y-2">
                    {conditions.map((row, index) => {
                        const operators = operatorLabelsForField(row.field_key);
                        return (
                            <div
                                key={`${row.field_key}-${index}`}
                                className="config-runtime-condition-row"
                                data-testid={`automation-condition-row-${index}`}
                                data-automation-condition-row={String(index)}
                            >
                                <select
                                    value={
                                        getWorkViewConditionFieldDef(row.field_key)?.key
                                        ?? row.field_key
                                    }
                                    disabled={disabled}
                                    onChange={(e) => updateRow(index, { field_key: e.target.value })}
                                    className="config-runtime-select"
                                    data-testid={`automation-condition-field-${index}`}
                                    aria-label={`Condition ${index + 1} field`}
                                >
                                    {fieldDefs.map((def) => (
                                        <option key={def.key} value={def.key}>
                                            {def.label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={row.operator}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        updateRow(index, {
                                            operator: e.target.value as WorkViewFilterOperatorV1,
                                        })
                                    }
                                    className="config-runtime-select"
                                    data-testid={`automation-condition-operator-${index}`}
                                    aria-label={`Condition ${index + 1} operator`}
                                >
                                    {operators.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <div className={disabled ? "pointer-events-none opacity-50" : undefined}>
                                    <WorkViewConditionValueControl
                                        fieldKey={row.field_key}
                                        operator={row.operator}
                                        value={row.value}
                                        options={optionsForField(row.field_key)}
                                        onChange={(value) => updateRow(index, { value })}
                                        testId={`automation-condition-value-${index}`}
                                    />
                                </div>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => removeRow(index)}
                                    className="config-runtime-icon-button"
                                    data-testid={`automation-condition-remove-${index}`}
                                    aria-label={`Remove condition ${index + 1}`}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <button
                type="button"
                disabled={disabled}
                onClick={addRow}
                className="self-start text-[11px] font-semibold text-alloy-midnight/70 underline-offset-2 hover:underline disabled:opacity-50"
                data-testid="automation-condition-add"
            >
                + Add condition
            </button>
        </div>
    );
}
