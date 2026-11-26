"use client";

import { useMemo } from "react";
import {
    layoutRefKeyForInquiryChildOcmField,
    type InquiryChildPlacementFieldMetadata,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import type { InquiryChildNativeOcmFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import {
    useLayoutRuntimeOptionSetLoader,
    useLayoutRuntimePlacementData,
} from "@/components/layout/LayoutRuntimePlacementDataProvider";

const INPUT_CLASS =
    "w-full rounded-md border border-admin-border bg-white px-2 py-1 text-sm text-alloy-midnight outline-none focus:border-alloy-juniper/40 focus:ring-1 focus:ring-alloy-juniper/10";

const SELECT_CLASS =
    "min-w-[8rem] w-full rounded-md border border-admin-border bg-white px-2 py-1 text-sm text-alloy-midnight outline-none focus:border-alloy-juniper/40 focus:ring-1 focus:ring-alloy-juniper/10";

type Props = {
    refKey: string;
    value: string;
    onChange: (value: string) => void;
    onPickOption?: (value: string, label: string) => void;
    rowKey?: string;
    getDependentValue?: (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => string;
    disabled?: boolean;
    /** @deprecated Prefer `variant="compact"`. */
    compact?: boolean;
    /** Control density — inline is for drawer row/card in-place edit; inline-cell keeps label+control on one line. */
    variant?: "default" | "compact" | "inline" | "inline-cell";
    "data-layout-runtime-editable"?: string;
    "data-layout-runtime-ref-key"?: string;
    "data-layout-runtime-row-key"?: string;
};

const COMPACT_INPUT_CLASS =
    "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-alloy-midnight outline-none transition-colors hover:border-alloy-stone/15 focus:border-alloy-juniper/35 focus:bg-white focus:px-2 focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)]";

const COMPACT_SELECT_CLASS =
    "min-w-0 w-full max-w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-alloy-midnight outline-none transition-colors hover:border-alloy-stone/15 focus:border-alloy-juniper/35 focus:bg-white focus:px-1.5";

const INLINE_INPUT_CLASS =
    "h-6 w-full min-w-0 max-w-[11rem] rounded border border-alloy-stone/12 bg-white/80 px-1.5 py-0 text-[11px] leading-tight text-alloy-midnight outline-none transition-[border-color,box-shadow] hover:border-alloy-stone/25 focus:border-alloy-juniper/40 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)] [color-scheme:light]";

const INLINE_SELECT_CLASS =
    "h-6 min-w-0 w-full max-w-full rounded border border-alloy-stone/12 bg-white/80 px-1 py-0 text-[11px] leading-tight text-alloy-midnight outline-none transition-[border-color,box-shadow] hover:border-alloy-stone/25 focus:border-alloy-juniper/40 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)]";

const INLINE_CELL_INPUT_CLASS =
    "inline-block h-6 w-auto min-w-[4.5rem] max-w-[10rem] rounded border border-alloy-stone/12 bg-white/80 px-1.5 py-0 text-[11px] leading-tight text-alloy-midnight align-baseline outline-none transition-[border-color,box-shadow] hover:border-alloy-stone/25 focus:border-alloy-juniper/40 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)] [color-scheme:light]";

const INLINE_CELL_SELECT_CLASS =
    "inline-block h-6 w-auto min-w-[4.5rem] max-w-[10rem] rounded border border-alloy-stone/12 bg-white/80 px-1 py-0 text-[11px] leading-tight text-alloy-midnight align-baseline outline-none transition-[border-color,box-shadow] hover:border-alloy-stone/25 focus:border-alloy-juniper/40 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)]";

function resolveSelectOptions(
    placement: InquiryChildPlacementFieldMetadata | undefined,
    optionSource: string | undefined,
    optionSetKey: string | null | undefined,
    placementData: ReturnType<typeof useLayoutRuntimePlacementData>,
    optionSetOptions: LayoutRuntimeSelectOption[],
    locationId: string,
    programKey: string,
): { options: LayoutRuntimeSelectOption[]; disabled: boolean; placeholder: string } {
    if (optionSource === "layout_boolean") {
        return {
            options: [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
            ],
            disabled: false,
            placeholder: "Select…",
        };
    }
    if (optionSource === "locations") {
        return {
            options: placementData?.siteOptions ?? [],
            disabled: false,
            placeholder: "Select a school",
        };
    }
    if (optionSource === "programs_for_location") {
        const disabled = !locationId.trim();
        return {
            options: placementData?.programOptionsForSite(locationId) ?? [],
            disabled,
            placeholder: disabled ? "Select a school first" : "Select a program",
        };
    }
    if (optionSource === "rooms_for_location_program") {
        const disabled = !locationId.trim();
        return {
            options: placementData?.roomOptionsForSiteAndProgram(locationId, programKey) ?? [],
            disabled,
            placeholder: disabled ? "Select a school first" : "Select a room",
        };
    }
    if (optionSource === "enrollment_child_status") {
        return {
            options: placementData?.enrollmentChildStatusOptions ?? [],
            disabled: false,
            placeholder: "Select status",
        };
    }
    if (optionSource === "option_set" && optionSetKey) {
        return {
            options: optionSetOptions,
            disabled: false,
            placeholder: "Select…",
        };
    }
    void placement;
    return { options: [], disabled: false, placeholder: "Select…" };
}

type LayoutRuntimeSelectOption = { value: string; label: string };

export default function LayoutRuntimeFieldInput({
    refKey,
    value,
    onChange,
    onPickOption,
    rowKey,
    getDependentValue,
    disabled = false,
    compact = false,
    variant: variantProp,
    ...dataAttrs
}: Props) {
    const control = resolveLayoutRuntimeFieldControl(refKey);
    const placementData = useLayoutRuntimePlacementData();
    const optionSetOptions = useLayoutRuntimeOptionSetLoader(control.option_set_key);
    const variant = variantProp ?? (compact ? "compact" : "default");
    const inputClass =
        variant === "inline-cell" ? INLINE_CELL_INPUT_CLASS
        : variant === "inline" ? INLINE_INPUT_CLASS
        : variant === "compact" ? COMPACT_INPUT_CLASS
        : INPUT_CLASS;
    const selectClass =
        variant === "inline-cell" ? INLINE_CELL_SELECT_CLASS
        : variant === "inline" ? INLINE_SELECT_CLASS
        : variant === "compact" ? COMPACT_SELECT_CLASS
        : SELECT_CLASS;

    const locationId = getDependentValue?.("location_id") ?? "";
    const programCategoryId = getDependentValue?.("program_category_id") ?? "";
    const programKey = placementData?.resolveRoomProgramFilterKey(programCategoryId) ?? "";

    const selectMeta = useMemo(
        () =>
            resolveSelectOptions(
                control.placement,
                control.option_source,
                control.option_set_key,
                placementData,
                optionSetOptions,
                locationId,
                programKey,
            ),
        [
            control.option_set_key,
            control.option_source,
            control.placement,
            locationId,
            optionSetOptions,
            placementData,
            programKey,
        ],
    );

    if (control.controlType === "date") {
        return (
            <input
                type="date"
                className={inputClass}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                data-layout-runtime-editable="true"
                data-layout-runtime-ref-key={refKey}
                data-layout-runtime-row-key={rowKey}
                data-layout-runtime-field-variant={variant}
            />
        );
    }

    if (control.controlType === "select") {
        const fieldDisabled = disabled || selectMeta.disabled || (placementData?.loading && selectMeta.options.length === 0);
        return (
            <select
                className={selectClass}
                value={value}
                onChange={(e) => {
                    const next = e.target.value;
                    onChange(next);
                    const picked = selectMeta.options.find((opt) => opt.value === next);
                    if (picked?.label) onPickOption?.(next, picked.label);
                }}
                disabled={fieldDisabled}
                data-layout-runtime-editable="true"
                data-layout-runtime-ref-key={refKey}
                data-layout-runtime-row-key={rowKey}
                data-layout-runtime-field-variant={variant}
                aria-label={refKey}
            >
                <option value="">{selectMeta.placeholder}</option>
                {selectMeta.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <input
            type="text"
            className={inputClass}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            {...dataAttrs}
            data-layout-runtime-editable="true"
            data-layout-runtime-ref-key={refKey}
            data-layout-runtime-row-key={rowKey}
        />
    );
}

export function layoutRuntimeDependentValueReader(
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string,
    rowKey?: string,
): (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => string {
    return (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) =>
        getFieldValue(layoutRefKeyForInquiryChildOcmField(dependsOnOcmKey), "", rowKey);
}
