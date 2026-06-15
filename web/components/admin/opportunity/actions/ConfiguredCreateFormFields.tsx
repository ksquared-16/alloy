"use client";

import { useCallback, useMemo } from "react";
import type { EntityCreateFormField } from "@/lib/admin/actions/entityCreateFormFieldLoader";
import {
    useInquiryChildPlacementCascade,
    useInquiryChildPlacementDefaultSite,
} from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import {
    applyInquiryChildPlacementFieldChange,
    inquiryChildPlacementRoleForFieldKey,
    placementFieldKeysInValues,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { useOptionSetSelectOptions } from "@/lib/admin/hooks/useOptionSetSelectOptions";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";

const INPUT =
    "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-[rgba(0,162,131,0.45)] focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60";

type Props = {
    fields: EntityCreateFormField[];
    values: Record<string, string>;
    onChange: (fieldKey: string, value: string) => void;
    disabled?: boolean;
    dataPrefix?: string;
    /** Lead/opportunity location used for program cascade when location_id field is empty. */
    inheritedLocationId?: string | null;
};

function inputTypeForField(field: EntityCreateFormField): string {
    if (field.field_type === "date") return "date";
    if (field.field_type === "phone") return "tel";
    if (field.field_type === "email" || field.field_key === "email") return "email";
    return "text";
}

function isConfiguredOptionSetSelectField(field: EntityCreateFormField): boolean {
    if (inquiryChildPlacementRoleForFieldKey(field.field_key)) return false;
    return resolveSelectFieldBinding({
        field_type: field.field_type,
        config: field.option_set_key ? { option_set_key: field.option_set_key } : null,
    }).isSelect;
}

/** Renders configured create-form field definitions for drawer action modals. */
export default function ConfiguredCreateFormFields({
    fields,
    values,
    onChange,
    disabled = false,
    dataPrefix = "configured-create",
    inheritedLocationId = null,
}: Props) {
    const setKeys = fields.map((f) => f.option_set_key);
    const { optionsBySetKey } = useOptionSetSelectOptions(setKeys);

    const { locationKey, programKey, roomKey } = useMemo(() => placementFieldKeysInValues(values), [values]);
    const effectiveLocationValue = useMemo(() => {
        const fromValues = locationKey ? (values[locationKey] ?? "").trim() : "";
        if (fromValues) return fromValues;
        return (inheritedLocationId ?? "").trim();
    }, [inheritedLocationId, locationKey, values]);
    const cascade = useInquiryChildPlacementCascade({
        locationValue: effectiveLocationValue,
        programValue: programKey ? (values[programKey] ?? "") : "",
    });

    const handleDefaultSite = useCallback(
        (siteId: string) => {
            if (!locationKey) return;
            onChange(locationKey, siteId);
        },
        [locationKey, onChange]
    );

    useInquiryChildPlacementDefaultSite({
        locationFieldKey: locationKey,
        locationValue: effectiveLocationValue,
        defaultSiteId: cascade.defaultSiteId,
        siteSelectionReady: cascade.siteSelectionReady,
        onSelectSite: handleDefaultSite,
    });

    const handleFieldChange = useCallback(
        (fieldKey: string, value: string) => {
            const next = applyInquiryChildPlacementFieldChange(fieldKey, value, values);
            for (const [k, v] of Object.entries(next)) {
                if (values[k] !== v) onChange(k, v);
            }
        },
        [onChange, values]
    );

    if (fields.length === 0) {
        return (
            <p className="text-sm text-alloy-midnight/60" data-configured-create-form-empty="true">
                No configured create fields are available for this action.
            </p>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3" data-configured-create-form="true">
            {fields.map((field) => {
                const placementRole = inquiryChildPlacementRoleForFieldKey(field.field_key);
                const selectField = isConfiguredOptionSetSelectField(field);
                const options = field.option_set_key ? (optionsBySetKey[field.option_set_key] ?? []) : [];

                let placementOptions = options;
                let placementDisabled = disabled;
                let placementPlaceholder = field.placeholder ?? "Select…";

                if (placementRole === "location") {
                    placementOptions = cascade.siteOptions;
                    placementPlaceholder = "Select a school";
                } else if (placementRole === "program") {
                    placementOptions = cascade.programOptions;
                    placementDisabled = disabled || cascade.programDisabled;
                    placementPlaceholder = cascade.programDisabled ? "Select a school first" : "Select a program";
                } else if (placementRole === "room") {
                    placementOptions = cascade.roomOptions;
                    placementDisabled = disabled || cascade.roomDisabled;
                    placementPlaceholder = cascade.roomDisabled ? "Select a school first" : "Select a room";
                }

                return (
                    <label key={field.field_key} className="text-sm">
                        <div className="mb-1 font-medium text-alloy-midnight">
                            {field.label}
                            {field.is_required ?
                                <span className="text-alloy-ember"> *</span>
                            :   null}
                        </div>
                        {field.help_text ?
                            <p className="mb-1 text-[11px] text-alloy-midnight/55">{field.help_text}</p>
                        :   null}
                        {placementRole || selectField ?
                            <SelectFieldControl
                                value={values[field.field_key] ?? ""}
                                onChange={(v) => handleFieldChange(field.field_key, v)}
                                options={placementRole ? placementOptions : options}
                                disabled={placementRole ? placementDisabled : disabled}
                                placeholder={placementRole ? placementPlaceholder : (field.placeholder ?? "Select…")}
                                data-testid={`${dataPrefix}-select-${field.field_key}`}
                                aria-label={field.label}
                            />
                        :   <input
                                type={inputTypeForField(field)}
                                value={values[field.field_key] ?? ""}
                                onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
                                className={INPUT}
                                disabled={disabled}
                                placeholder={field.placeholder ?? undefined}
                                data-configured-create-field={field.field_key}
                                data-testid={`${dataPrefix}-input-${field.field_key}`}
                            />
                        }
                    </label>
                );
            })}
        </div>
    );
}
