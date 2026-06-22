"use client";

import { Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    BOS_FIELD_CONFIDENCE_STYLES,
    type BosFieldConfidenceDisplayLevel,
} from "@/lib/admin/actions/actionWorkspaceBosTheme";
import {
    useInquiryChildPlacementCascade,
    useInquiryChildPlacementDefaultSite,
} from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import {
    applyInquiryChildPlacementFieldChange,
    placementFieldKeysInValues,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { useOptionSetSelectOptions } from "@/lib/admin/hooks/useOptionSetSelectOptions";
import {
    CREATE_LEAD_DERIVED_FIELD_BINDINGS,
    resolveDerivedFieldDisplay,
} from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";
import {
    CREATE_LEAD_UNIFIED_OPTIONAL_KEYS,
    CREATE_LEAD_UNIFIED_REQUIRED_KEYS,
} from "@/lib/admin/actions/createLeadPlatformGather";

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
    /** BOS extraction confidence — shown after Analyze in draft edit mode. */
    fieldConfidence?: Record<string, BosFieldConfidenceDisplayLevel>;
    /** Unified draft lead layout — no entity tabs (Create Lead review step). */
    layout?: "tabs" | "unified" | "context";
};

function FieldConfidenceBadge({ level }: { level: BosFieldConfidenceDisplayLevel }) {
    const style = BOS_FIELD_CONFIDENCE_STYLES[level];
    return (
        <span className="ml-auto flex shrink-0 items-center gap-1">
            {level === "high" ?
                <Check className="h-3 w-3 text-alloy-pine" strokeWidth={2.5} aria-hidden />
            :   null}
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${style.badge}`}>
                {style.label}
            </span>
        </span>
    );
}

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
    fieldConfidence,
    layout = "tabs",
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

    const fieldsByKey = useMemo(
        () => Object.fromEntries(allFields.map((f) => [f.payload_key, f])),
        [allFields],
    );

    const renderField = (field: ActionWorkspaceGatherField) => {
        if (field.payload_key === "child_location_id" && (values.location_id ?? "").trim()) {
            return null;
        }

        const derivedDisplay = resolveDerivedFieldDisplay({
            target_key: field.payload_key,
            values,
            bindings: CREATE_LEAD_DERIVED_FIELD_BINDINGS,
        });
        if (derivedDisplay) {
            return (
                <div
                    key={field.payload_key}
                    className="border-l-2 border-alloy-stone/10 pl-2"
                    data-testid={`${dataTestIdPrefix}-field-${field.payload_key}`}
                >
                    <div className={`${LABEL} flex items-start gap-2`}>
                        <span>{field.field_label}</span>
                        {fieldConfidence?.[field.payload_key] ?
                            <FieldConfidenceBadge level={fieldConfidence[field.payload_key]!} />
                        :   null}
                    </div>
                    <p
                        className="mt-2 rounded-xl border border-alloy-stone/10 bg-alloy-stone/5 px-4 py-3 text-[15px] font-medium text-alloy-midnight"
                        data-testid={`${dataTestIdPrefix}-derived-${field.payload_key}`}
                    >
                        {derivedDisplay.display}
                    </p>
                    <p className="mt-1 text-[11px] text-alloy-midnight/45">Calculated from date of birth</p>
                </div>
            );
        }

        let selectOptions = field.option_set_key ? (optionsBySetKey[field.option_set_key] ?? []) : [];
        let fieldDisabled = disabled;
        let placeholder = "Select…";

        if (field.placement_select === "site") {
            selectOptions = cascade.siteOptions;
            placeholder = "Select a school";
        } else if (field.placement_select === "site_program") {
            selectOptions = cascade.programOptions;
            fieldDisabled = disabled || cascade.programDisabled;
            placeholder = cascade.programDisabled ? "Select a school first" : "Select a program";
        } else if (field.placement_select === "site_room") {
            selectOptions = cascade.roomOptions;
            fieldDisabled = disabled || cascade.roomDisabled;
            placeholder = cascade.roomDisabled ? "Select a school first" : "Select a room";
        }

        const isRequired =
            platformRequiredKeys.includes(field.payload_key) ||
            CREATE_LEAD_UNIFIED_REQUIRED_KEYS.includes(
                field.payload_key as (typeof CREATE_LEAD_UNIFIED_REQUIRED_KEYS)[number],
            );

        return (
            <label
                key={field.payload_key}
                className={`${field.multiline ? "col-span-2" : ""} ${
                    fieldConfidence?.[field.payload_key] ?
                        BOS_FIELD_CONFIDENCE_STYLES[fieldConfidence[field.payload_key]!].border
                    :   ""
                } border-l-2 pl-2`}
                data-testid={`${dataTestIdPrefix}-field-${field.payload_key}`}
            >
                <div className={`${LABEL} flex items-start gap-2`}>
                    <span>
                        {field.field_label}
                        {isRequired && field.payload_key !== "email" && field.payload_key !== "phone" ?
                            <span className="text-alloy-ember"> *</span>
                        :   null}
                        {(field.payload_key === "email" || field.payload_key === "phone") ?
                            <span className="ml-1 text-[11px] font-normal text-alloy-midnight/40">
                                (one required)
                            </span>
                        :   null}
                    </span>
                    {fieldConfidence?.[field.payload_key] ?
                        <FieldConfidenceBadge level={fieldConfidence[field.payload_key]!} />
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
    };

    if (layout === "context") {
        const contextFields = sections.flatMap((section) => section.fields);
        if (!contextFields.length) return null;

        return (
            <div className="flex flex-col gap-4" data-testid={`${dataTestIdPrefix}-fields`}>
                <div data-testid={`${dataTestIdPrefix}-section-context`}>
                    <h3 className="text-[12px] font-semibold text-alloy-midnight/70">Lead context</h3>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 content-start">
                        {contextFields.map((field) => renderField(field))}
                    </div>
                </div>
            </div>
        );
    }

    if (layout === "unified") {
        const requiredFields = CREATE_LEAD_UNIFIED_REQUIRED_KEYS.map((key) => fieldsByKey[key]).filter(Boolean);
        const optionalFields = CREATE_LEAD_UNIFIED_OPTIONAL_KEYS.map((key) => fieldsByKey[key]).filter(Boolean);

        return (
            <div className="flex h-full min-h-0 flex-col gap-8" data-testid={`${dataTestIdPrefix}-fields`}>
                <div data-testid={`${dataTestIdPrefix}-section-required`}>
                    <h3 className="text-[13px] font-semibold text-alloy-midnight">Required to create lead</h3>
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 content-start">
                        {requiredFields.map((field) => renderField(field!))}
                    </div>
                </div>
                <div data-testid={`${dataTestIdPrefix}-section-optional`}>
                    <h3 className="text-[13px] font-semibold text-alloy-midnight">Optional if available</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/45">
                        Child, program, and source details — not required to create the lead.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 content-start">
                        {optionalFields.map((field) => renderField(field!))}
                    </div>
                </div>
            </div>
        );
    }

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
                            .map((field) => renderField(field))}
                    </div>
                </div>
            :   null}
        </div>
    );
}
