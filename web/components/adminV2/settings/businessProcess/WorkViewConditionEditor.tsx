"use client";

import { useCallback, useEffect, useState } from "react";
import WorkViewConditionValueControl from "@/components/adminV2/settings/businessProcess/WorkViewConditionValueControl";
import { ConfigRuntimeSectionHeader } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";
import { useWorkViewsConfiguration } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";
import {
    createDefaultWorkViewFilterRow,
    operatorLabelsForField,
    patchWorkViewFilterRow,
    type WorkViewFilterOption,
} from "@/lib/lifecycle/workViewFilterValueControls";
import {
    DEFAULT_WORK_VIEW_CONDITION_FIELD_KEY,
    getWorkViewConditionField,
    workViewConditionFieldGroups,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN } from "@/lib/lifecycle/businessProcessUiLabels";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type StatusOptionsResponse = { options?: { value: string; label: string }[] };
type LocationsResponse = {
    locations?: { id: string; label: string | null; name?: string | null }[];
};
type ProgramCategoriesResponse = {
    categories?: { key: string; label: string | null }[];
};

const FIELD_GROUPS = workViewConditionFieldGroups();

export default function WorkViewConditionEditor({
    filters,
    onChange,
    match = "all",
    onMatchChange,
}: {
    filters: WorkViewFilterV1[];
    onChange: (filters: WorkViewFilterV1[]) => void;
    /** Condition combinator. `all` = AND, `any` = OR. */
    match?: "all" | "any";
    onMatchChange?: (match: "all" | "any") => void;
}) {
    const { stageOptions } = useWorkViewsConfiguration();
    const [opportunityStatusOptions, setOpportunityStatusOptions] = useState<WorkViewFilterOption[]>([]);
    const [childEnrollmentStatusOptions, setChildEnrollmentStatusOptions] = useState<WorkViewFilterOption[]>([]);
    const [siteOptions, setSiteOptions] = useState<WorkViewFilterOption[]>([]);
    const [roomOptions, setRoomOptions] = useState<WorkViewFilterOption[]>([]);
    const [programOptions, setProgramOptions] = useState<WorkViewFilterOption[]>([]);

    const loadOptions = useCallback(async () => {
        try {
            const [oppRes, childRes, siteRes, roomRes, programRes] = await Promise.all([
                fetch("/api/admin/status-options?entity_type=opportunities", workspaceDataFetchInit()),
                fetch("/api/admin/status-options?entity_type=opportunity_customer_members", workspaceDataFetchInit()),
                // Campus options: real campuses only (`location_type=site`) — never units/scaffolding.
                fetch("/api/admin/locations?location_type=site", workspaceDataFetchInit()),
                // Room options: classrooms (`location_type=unit`).
                fetch("/api/admin/locations?location_type=unit", workspaceDataFetchInit()),
                fetch("/api/admin/location-program-categories", workspaceDataFetchInit()),
            ]);
            if (oppRes.ok) {
                const json = (await oppRes.json()) as StatusOptionsResponse;
                setOpportunityStatusOptions((json.options ?? []).map((o) => ({ value: o.value, label: o.label })));
            }
            if (childRes.ok) {
                const json = (await childRes.json()) as StatusOptionsResponse;
                setChildEnrollmentStatusOptions((json.options ?? []).map((o) => ({ value: o.value, label: o.label })));
            }
            if (siteRes.ok) {
                const json = (await siteRes.json()) as LocationsResponse;
                setSiteOptions(
                    (json.locations ?? []).map((loc) => ({
                        value: loc.id,
                        label: (loc.label ?? loc.name ?? loc.id).trim() || loc.id,
                    })),
                );
            }
            if (roomRes.ok) {
                const json = (await roomRes.json()) as LocationsResponse;
                setRoomOptions(
                    (json.locations ?? []).map((loc) => ({
                        value: loc.id,
                        label: (loc.label ?? loc.name ?? loc.id).trim() || loc.id,
                    })),
                );
            }
            if (programRes.ok) {
                const json = (await programRes.json()) as ProgramCategoriesResponse;
                // De-dupe program categories by key across locations for the (currently location-agnostic) picker.
                const byKey = new Map<string, WorkViewFilterOption>();
                for (const cat of json.categories ?? []) {
                    const value = String(cat.key ?? "").trim();
                    if (!value || byKey.has(value)) continue;
                    byKey.set(value, { value, label: (cat.label ?? value).trim() || value });
                }
                setProgramOptions([...byKey.values()]);
            }
        } catch {
            /* keep empty — typed controls still render presets */
        }
    }, []);

    useEffect(() => {
        void loadOptions();
    }, [loadOptions]);

    /** Resolve the option list for a field from its typed option source. */
    const optionsForField = useCallback(
        (fieldKey: string): readonly WorkViewFilterOption[] => {
            const source = getWorkViewConditionField(fieldKey)?.optionSource;
            if (!source) return [];
            switch (source.kind) {
                case "process_stages":
                    return stageOptions;
                case "status_definitions":
                    return source.entityType === "opportunity_customer_members" ?
                            childEnrollmentStatusOptions
                        :   opportunityStatusOptions;
                case "locations":
                    return siteOptions;
                case "rooms":
                    return roomOptions;
                case "programs":
                    return programOptions;
                default:
                    return [];
            }
        },
        [childEnrollmentStatusOptions, opportunityStatusOptions, programOptions, roomOptions, siteOptions, stageOptions],
    );

    const updateRow = (index: number, patch: Partial<WorkViewFilterV1>) => {
        onChange(filters.map((row, i) => (i === index ? patchWorkViewFilterRow(row, patch) : row)));
    };

    const removeRow = (index: number) => {
        onChange(filters.filter((_, i) => i !== index));
    };

    const addRow = () => {
        onChange([...filters, createDefaultWorkViewFilterRow(DEFAULT_WORK_VIEW_CONDITION_FIELD_KEY)]);
    };

    return (
        <div className="space-y-3" data-testid="work-view-condition-editor">
            <div className="flex items-center justify-between gap-3">
                <ConfigRuntimeSectionHeader>{BUSINESS_PROCESS_WORK_VIEW_SHOW_WORK_WHEN}</ConfigRuntimeSectionHeader>
                {filters.length > 1 && onMatchChange ? (
                    <label className="flex items-center gap-2 text-xs font-medium text-alloy-midnight/55">
                        <span>Match</span>
                        <select
                            value={match}
                            onChange={(e) => onMatchChange(e.target.value === "any" ? "any" : "all")}
                            className="config-runtime-select"
                            data-testid="work-view-condition-match"
                            aria-label="Match all or any conditions"
                        >
                            <option value="all">all (AND)</option>
                            <option value="any">any (OR)</option>
                        </select>
                    </label>
                ) : null}
            </div>
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
                                value={getWorkViewConditionField(row.field_key)?.key ?? row.field_key}
                                onChange={(e) => updateRow(index, { field_key: e.target.value })}
                                className="config-runtime-select"
                                data-testid={`work-view-condition-field-${index}`}
                            >
                                {FIELD_GROUPS.map((group) => (
                                    <optgroup key={group.key} label={group.label}>
                                        {group.fields.map((def) => (
                                            <option key={def.key} value={def.key}>
                                                {def.label}
                                            </option>
                                        ))}
                                    </optgroup>
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
                                options={optionsForField(row.field_key)}
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
