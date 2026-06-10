"use client";

import { useCallback, useMemo, useState } from "react";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    useInquiryChildPlacementCascade,
    useInquiryChildPlacementDefaultSite,
} from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import {
    applyInquiryChildPlacementFieldChange,
    placementFieldKeysInValues,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { useOptionSetSelectOptions } from "@/lib/admin/hooks/useOptionSetSelectOptions";
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";

const LABEL = "text-[13px] font-medium text-alloy-midnight/75";
const INPUT =
    "w-full rounded-xl border border-alloy-stone/12 bg-white px-4 py-3 text-[15px] text-alloy-midnight shadow-[inset_0_1px_2px_rgba(24,39,58,0.03)] focus:border-[#00A283]/35 focus:outline-none focus:ring-2 focus:ring-[#00A283]/10 disabled:opacity-60";

type Section = { key: string; label: string; fields: ActionWorkspaceGatherField[] };

type Props = {
    sections: Section[];
    values: Record<string, string>;
    onChange: (payloadKey: string, value: string) => void;
    disabled?: boolean;
    dataTestIdPrefix?: string;
    platformRequiredKeys?: readonly string[];
};

function inputType(field: ActionWorkspaceGatherField): string {
    if (field.value_kind === "email") return "email";
    if (field.value_kind === "phone") return "tel";
    if (field.value_kind === "date") return "date";
    return "text";
}

function sectionHint(key: string, inheritedLocationLabel: string | null): string {
    if (key === "person") return "Parent or guardian contact details";
    if (key === "child") {
        return inheritedLocationLabel
            ? `Enrollment inherits location: ${inheritedLocationLabel}. Program and room options are filtered to this site.`
            : "Child enrollment fields inherit the lead location when set.";
    }
    return "Set lead location once — child enrollment inherits it.";
}

function inheritedLeadLocationLabel(
    values: Record<string, string>,
    siteOptions: { value: string; label: string }[]
): string | null {
    const locationId = (values.location_id ?? values.child_location_id ?? "").trim();
    if (!locationId) return null;
    const hit = siteOptions.find((o) => o.value === locationId);
    return hit?.label?.trim() || locationId;
}

/** BOS-assisted gather — Linear/Notion hierarchy, generous spacing. */
export function ActionWorkspaceGatherFields({
    sections,
    values,
    onChange,
    disabled = false,
    dataTestIdPrefix = "action-workspace-gather",
    platformRequiredKeys = [],
}: Props) {
    const [activeTab, setActiveTab] = useState(sections[0]?.key ?? "person");
    const activeSection = sections.find((s) => s.key === activeTab) ?? sections[0];
    const allFields = sections.flatMap((s) => s.fields);
    const { optionsBySetKey } = useOptionSetSelectOptions(allFields.map((f) => f.option_set_key));

    const { locationKey, programKey } = useMemo(() => placementFieldKeysInValues(values), [values]);
    const effectiveLocationValue = useMemo(() => {
        const fromLead = (values.location_id ?? "").trim();
        if (fromLead) return fromLead;
        return locationKey ? (values[locationKey] ?? "").trim() : "";
    }, [values, locationKey]);
    const cascade = useInquiryChildPlacementCascade({
        locationValue: effectiveLocationValue,
        programValue: programKey ? (values[programKey] ?? "") : "",
    });
    const inheritedLocationLabel = useMemo(
        () => inheritedLeadLocationLabel(values, cascade.siteOptions),
        [values, cascade.siteOptions]
    );

    const handleDefaultSite = useCallback(
        (siteId: string) => {
            if (!locationKey) return;
            onChange(locationKey, siteId);
        },
        [locationKey, onChange]
    );

    useInquiryChildPlacementDefaultSite({
        locationFieldKey: locationKey,
        locationValue: locationKey ? (values[locationKey] ?? "") : "",
        defaultSiteId: cascade.defaultSiteId,
        siteSelectionReady: cascade.siteSelectionReady,
        onSelectSite: handleDefaultSite,
    });

    const handleFieldChange = useCallback(
        (payloadKey: string, value: string) => {
            const next = applyInquiryChildPlacementFieldChange(payloadKey, value, values);
            for (const [k, v] of Object.entries(next)) {
                if (values[k] !== v) onChange(k, v);
            }
        },
        [onChange, values]
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-6" data-testid={`${dataTestIdPrefix}-fields`}>
            <div className="flex shrink-0 gap-6 border-b border-alloy-stone/10">
                {sections.map((section) => (
                    <button
                        key={section.key}
                        type="button"
                        onClick={() => setActiveTab(section.key)}
                        className={
                            activeTab === section.key ?
                                "-mb-px border-b-2 border-[#00A283] pb-3 text-[13px] font-semibold text-alloy-midnight"
                            :   "pb-3 text-[13px] font-medium text-alloy-midnight/45 transition-colors hover:text-alloy-midnight/70"
                        }
                        data-testid={`${dataTestIdPrefix}-tab-${section.key}`}
                    >
                        {section.label}
                    </button>
                ))}
            </div>

            {activeSection ?
                <div
                    className="min-h-0 flex-1 overflow-y-auto"
                    data-testid={`${dataTestIdPrefix}-section-${activeSection.key}`}
                >
                    <div className="mb-6">
                        <h3 className="text-base font-semibold tracking-tight text-alloy-midnight">
                            {activeSection.label}
                        </h3>
                        <p className="mt-1 text-[13px] text-alloy-midnight/50">
                            {sectionHint(activeSection.key, inheritedLocationLabel)}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-6 content-start">
                        {activeSection.fields
                            .filter((field) => {
                                if (field.payload_key !== "child_location_id") return true;
                                return !(values.location_id ?? "").trim();
                            })
                            .map((field) => {
                            let selectOptions =
                                field.option_set_key ? (optionsBySetKey[field.option_set_key] ?? []) : [];
                            let fieldDisabled = disabled;
                            let placeholder = "Select…";

                            if (field.placement_select === "site") {
                                selectOptions = cascade.siteOptions;
                                placeholder = "Select a school";
                            } else if (field.placement_select === "site_program") {
                                selectOptions = cascade.programOptions;
                                fieldDisabled = disabled || cascade.programDisabled;
                                placeholder =
                                    cascade.programDisabled ? "Select a school first" : "Select a program";
                            } else if (field.placement_select === "site_room") {
                                selectOptions = cascade.roomOptions;
                                fieldDisabled = disabled || cascade.roomDisabled;
                                placeholder = cascade.roomDisabled ? "Select a school first" : "Select a room";
                            }

                            return (
                                <label
                                    key={field.payload_key}
                                    className={field.multiline ? "col-span-2" : undefined}
                                    data-testid={`${dataTestIdPrefix}-field-${field.payload_key}`}
                                >
                                    <div className={LABEL}>
                                        {field.field_label}
                                        {platformRequiredKeys.includes(field.payload_key) ?
                                            <span className="text-alloy-ember"> *</span>
                                        :   null}
                                        {(field.payload_key === "email" || field.payload_key === "phone") ?
                                            <span className="ml-1 text-[11px] font-normal text-alloy-midnight/40">
                                                (one required)
                                            </span>
                                        :   null}
                                    </div>
                                    {field.multiline ?
                                        <textarea
                                            value={values[field.payload_key] ?? ""}
                                            disabled={disabled}
                                            onChange={(e) => handleFieldChange(field.payload_key, e.target.value)}
                                            rows={4}
                                            className={`${INPUT} mt-2 resize-none`}
                                            data-testid={`${dataTestIdPrefix}-input-${field.payload_key}`}
                                        />
                                    : field.value_kind === "select" ?
                                        <SelectFieldControl
                                            value={values[field.payload_key] ?? ""}
                                            disabled={fieldDisabled}
                                            onChange={(v) => handleFieldChange(field.payload_key, v)}
                                            options={selectOptions}
                                            placeholder={placeholder}
                                            className={`${INPUT} mt-2`}
                                            data-testid={`${dataTestIdPrefix}-select-${field.payload_key}`}
                                            aria-label={field.field_label}
                                        />
                                    :   <input
                                            type={inputType(field)}
                                            value={values[field.payload_key] ?? ""}
                                            disabled={disabled}
                                            onChange={(e) => handleFieldChange(field.payload_key, e.target.value)}
                                            className={`${INPUT} mt-2`}
                                            data-testid={`${dataTestIdPrefix}-input-${field.payload_key}`}
                                        />
                                    }
                                </label>
                            );
                        })}
                    </div>
                </div>
            :   null}
        </div>
    );
}
