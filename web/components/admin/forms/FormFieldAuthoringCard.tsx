"use client";

import clsx from "clsx";
import { useState } from "react";
import type { FormField } from "@/lib/forms/schema";
import {
    ANSWER_TYPE_OPTIONS,
    FIELD_AUTHORING_COPY,
    LAYOUT_OPTIONS,
    answerTypeLabel,
    describePrefillMode,
    describePrefillSource,
    groupSystemFieldsForPicker,
    type UiScalarKind,
} from "@/lib/forms/formFieldAuthoringPresentation";
import { linesToStaticOptions, type SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { opActionLink, opContextLabel, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

function staticOptionsToLines(opts: ReadonlyArray<{ value: string; label: string }> | undefined): string {
    if (!opts?.length) return "a|Option A\nb|Option B";
    return opts.map((o) => `${o.value}|${o.label}`).join("\n");
}

export type FormFieldAuthoringCardProps = {
    field: FormField;
    index: number;
    total: number;
    disabled?: boolean;
    entry: SystemFieldRegistryEntry | null;
    custom: boolean;
    locked: boolean;
    kind: UiScalarKind;
    pickerValue: string;
    systemFields: readonly SystemFieldRegistryEntry[];
    takenFieldIds: Set<string>;
    onPickerChange: (index: number, value: string) => void;
    onFieldChange: (index: number, next: FormField) => void;
    onMove: (index: number, dir: -1 | 1) => void;
    onRemove: (index: number) => void;
    /** Compact row layout for document composition sections (FD-13). */
    compact?: boolean;
    highlighted?: boolean;
    regionPosition?: number;
    regionTotal?: number;
    onFocus?: () => void;
};

const inputClass =
    "w-full rounded-md border border-alloy-midnight/10 bg-white px-2 py-1 text-sm text-alloy-midnight shadow-sm";
const selectClass =
    "rounded-md border border-alloy-midnight/10 bg-white px-1.5 py-1 text-xs text-alloy-midnight";

export function FormFieldAuthoringCard({
    field,
    index,
    total,
    disabled = false,
    entry,
    custom,
    locked,
    kind,
    pickerValue,
    systemFields,
    takenFieldIds,
    onPickerChange,
    onFieldChange,
    onMove,
    onRemove,
    compact = false,
    highlighted = false,
    regionPosition,
    regionTotal,
    onFocus,
}: FormFieldAuthoringCardProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const prefill = describePrefillSource(field, entry);
    const prefillMode = describePrefillMode(field, entry);
    const pos = regionPosition ?? index;
    const posTotal = regionTotal ?? total;
    const systemFieldGroups = groupSystemFieldsForPicker(systemFields);

    if (compact) {
        return (
            <li
                id={`form-field-row-${field.id}`}
                className={clsx(
                    "rounded-md px-2 py-1.5 transition-colors",
                    highlighted ? "bg-alloy-blue/[0.06] ring-1 ring-alloy-blue/30" : "hover:bg-alloy-stone/15"
                )}
                data-testid={`form-field-authoring-card-${field.id}`}
                onClick={() => onFocus?.()}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        className={clsx(inputClass, "min-w-[8rem] flex-1")}
                        disabled={disabled}
                        value={field.label}
                        aria-label={FIELD_AUTHORING_COPY.question}
                        onChange={(e) => {
                            if (field.type === "group") return;
                            onFieldChange(index, { ...field, label: e.target.value } as FormField);
                        }}
                        data-testid={`form-field-label-${field.id}`}
                    />
                    <select
                        className={clsx(selectClass, "max-w-[7rem]")}
                        disabled={disabled || locked}
                        value={kind}
                        title={answerTypeLabel(kind)}
                        onChange={(e) => onPickerChange(index, `kind:${e.target.value}`)}
                        data-testid={`form-field-answer-type-${field.id}`}
                    >
                        {ANSWER_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-alloy-midnight/75">
                        <input
                            type="checkbox"
                            disabled={disabled}
                            checked={field.required}
                            onChange={(e) => {
                                if (field.type === "group") return;
                                onFieldChange(index, { ...field, required: e.target.checked } as FormField);
                            }}
                            data-testid={`form-field-required-${field.id}`}
                        />
                        Req
                    </label>
                    <span
                        className={clsx(
                            "hidden max-w-[6rem] truncate text-[10px] font-medium sm:inline",
                            prefillMode.key === "locked_crm" ? "text-alloy-ember"
                            : prefillMode.key === "editable_prefill" ? "text-alloy-pine"
                            :   opMutedMeta
                        )}
                        data-testid={`form-field-prefill-mode-${field.id}`}
                        title={prefillMode.label}
                    >
                        {prefillMode.label}
                    </span>
                    <button
                        type="button"
                        className={clsx(opActionLink, "text-[11px]")}
                        onClick={() => setShowAdvanced((v) => !v)}
                        data-testid={`form-field-advanced-toggle-${field.id}`}
                    >
                        {showAdvanced ? "Less" : "More"}
                    </button>
                </div>

                {showAdvanced ?
                    <div className="mt-2 grid gap-2 border-t border-alloy-midnight/[0.06] pt-2 sm:grid-cols-2">
                        <label className="block space-y-0.5 sm:col-span-2">
                            <span className={opContextLabel}>{FIELD_AUTHORING_COPY.prefillSource}</span>
                            <select
                                className={selectClass}
                                disabled={disabled}
                                value={pickerValue}
                                onChange={(e) => onPickerChange(index, e.target.value)}
                                data-testid={`form-field-prefill-${field.id}`}
                            >
                                {systemFieldGroups.map((group) => (
                                    <optgroup key={group.id} label={group.label}>
                                        {group.fields.map((e) => {
                                            const takenElsewhere =
                                                takenFieldIds.has(e.field_key) && e.field_key !== field.id;
                                            return (
                                                <option
                                                    key={e.id}
                                                    value={`sys:${e.id}`}
                                                    disabled={takenElsewhere}
                                                >
                                                    {e.default_label}
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                ))}
                                <optgroup label="Advanced / Custom">
                                    <option value="__custom">{FIELD_AUTHORING_COPY.customField}</option>
                                </optgroup>
                            </select>
                        </label>
                        {field.type === "select" ?
                            <label className="block space-y-0.5 sm:col-span-2">
                                <span className={opContextLabel}>{FIELD_AUTHORING_COPY.options}</span>
                                <textarea
                                    className={clsx(inputClass, "min-h-[3rem] font-mono text-xs")}
                                    disabled={disabled}
                                    value={staticOptionsToLines(field.static_options)}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        if (entry) {
                                            onFieldChange(index, {
                                                ...formFieldFromRegistryEntry(entry, { static_options_lines: raw }),
                                                layout_width: field.layout_width,
                                            } as FormField);
                                        } else {
                                            onFieldChange(index, {
                                                ...field,
                                                type: "select",
                                                static_options: linesToStaticOptions(raw),
                                            } as FormField);
                                        }
                                    }}
                                    data-testid={`form-field-options-${field.id}`}
                                />
                            </label>
                        :   null}
                        <label className="block space-y-0.5 sm:col-span-2">
                            <span className={opContextLabel}>{FIELD_AUTHORING_COPY.helpText}</span>
                            <input
                                className={inputClass}
                                disabled={disabled}
                                value={"description" in field ? field.description ?? "" : ""}
                                onChange={(e) => {
                                    if (field.type === "group") return;
                                    const v = e.target.value.trim();
                                    onFieldChange(index, {
                                        ...field,
                                        ...(v ? { description: v } : { description: undefined }),
                                    } as FormField);
                                }}
                                data-testid={`form-field-help-${field.id}`}
                            />
                        </label>
                    </div>
                :   null}

                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                        type="button"
                        className={opActionLink}
                        disabled={disabled || pos === 0}
                        onClick={() => onMove(index, -1)}
                        data-testid={`form-field-move-up-${field.id}`}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className={opActionLink}
                        disabled={disabled || pos >= posTotal - 1}
                        onClick={() => onMove(index, 1)}
                        data-testid={`form-field-move-down-${field.id}`}
                    >
                        ↓
                    </button>
                    <button
                        type="button"
                        className="font-semibold text-alloy-ember hover:underline disabled:opacity-40"
                        disabled={disabled}
                        onClick={() => onRemove(index)}
                        data-testid={`form-field-remove-${field.id}`}
                    >
                        Remove
                    </button>
                </div>
            </li>
        );
    }

    // Legacy expanded card (non-composition contexts)
    return (
        <li className="space-y-2 rounded-md px-2 py-2" data-testid={`form-field-authoring-card-${field.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="min-w-0 flex-1 space-y-0.5">
                    <span className={opContextLabel}>{FIELD_AUTHORING_COPY.question}</span>
                    <input
                        className={inputClass}
                        disabled={disabled}
                        value={field.label}
                        onChange={(e) => {
                            if (field.type === "group") return;
                            onFieldChange(index, { ...field, label: e.target.value } as FormField);
                        }}
                        data-testid={`form-field-label-${field.id}`}
                    />
                </label>
                <select
                    className={selectClass}
                    disabled={disabled || locked}
                    value={kind}
                    onChange={(e) => onPickerChange(index, `kind:${e.target.value}`)}
                    data-testid={`form-field-answer-type-${field.id}`}
                >
                    {ANSWER_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className={opMetadata} data-testid={`form-field-prefill-mode-${field.id}`}>
                {prefillMode.label}
            </p>
            <button type="button" className={opActionLink} onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "Hide advanced" : "Advanced"}
            </button>
            {showAdvanced ?
                <p className={opMutedMeta}>{prefill.detail}</p>
            :   null}
            <div className="flex gap-2">
                <button type="button" className={opActionLink} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}>
                    {FIELD_AUTHORING_COPY.moveUp}
                </button>
                <button type="button" className={opActionLink} disabled={disabled || index >= total - 1} onClick={() => onMove(index, 1)}>
                    {FIELD_AUTHORING_COPY.moveDown}
                </button>
                <button type="button" className="text-xs text-alloy-ember" onClick={() => onRemove(index)}>
                    {FIELD_AUTHORING_COPY.remove}
                </button>
            </div>
        </li>
    );
}
