"use client";

import clsx from "clsx";
import type { FormField } from "@/lib/forms/schema";
import {
    ANSWER_TYPE_OPTIONS,
    FIELD_AUTHORING_COPY,
    LAYOUT_OPTIONS,
    answerTypeLabel,
    describePrefillSource,
    entityTypeLabel,
    type UiScalarKind,
} from "@/lib/forms/formFieldAuthoringPresentation";
import { linesToStaticOptions } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import {
    opActionLink,
    opContextLabel,
    opGroupedRowInner,
    opMetadata,
    opMutedMeta,
} from "@/lib/operational/ui/operationalVisualTokens";

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
};

const inputClass =
    "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm text-alloy-midnight shadow-sm";
const selectClass = "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2 py-1.5 text-sm text-alloy-midnight";

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
}: FormFieldAuthoringCardProps) {
    const prefill = describePrefillSource(field, entry);

    return (
        <li
            className={clsx(opGroupedRowInner, "space-y-3")}
            data-testid={`form-field-authoring-card-${field.id}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className={opMetadata}>
                        {FIELD_AUTHORING_COPY.question} {index + 1}
                    </p>
                    <p className={clsx("mt-0.5 text-sm font-medium", prefill.kind === "mapped" ? "text-alloy-pine" : opMutedMeta)}>
                        {prefill.label}
                    </p>
                    {prefill.detail ?
                        <p className={clsx("mt-0.5", opMutedMeta)}>{prefill.detail}</p>
                    :   null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={clsx(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium",
                            field.required ?
                                "bg-alloy-ember/[0.08] text-alloy-ember"
                            :   "bg-alloy-stone/40 text-alloy-midnight/70"
                        )}
                    >
                        {field.required ? FIELD_AUTHORING_COPY.required : FIELD_AUTHORING_COPY.optional}
                    </span>
                    <span className={clsx("rounded-md bg-alloy-stone/30 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/75")}>
                        {answerTypeLabel(kind)}
                    </span>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                    <span className={opContextLabel}>{FIELD_AUTHORING_COPY.prefillSource}</span>
                    <select
                        className={selectClass}
                        disabled={disabled}
                        value={pickerValue}
                        onChange={(e) => onPickerChange(index, e.target.value)}
                        data-testid={`form-field-prefill-${field.id}`}
                    >
                        <optgroup label="Mapped fields">
                            {systemFields.map((e) => {
                                const takenElsewhere = takenFieldIds.has(e.field_key) && e.field_key !== field.id;
                                return (
                                    <option key={e.id} value={`sys:${e.id}`} disabled={takenElsewhere}>
                                        {entityTypeLabel(e.entity_type)} — {e.default_label}
                                    </option>
                                );
                            })}
                        </optgroup>
                        <option value="__custom">{FIELD_AUTHORING_COPY.customField}</option>
                    </select>
                    {entry && !entry.public_intake_safe ?
                        <p className="mt-1 text-xs text-alloy-ember">{FIELD_AUTHORING_COPY.staffOnlyNote}</p>
                    :   null}
                    {custom ?
                        <p className="mt-1 text-xs text-alloy-ember">{FIELD_AUTHORING_COPY.customNote}</p>
                    :   null}
                </label>

                <label className="block space-y-1 sm:col-span-2">
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

                <label className="block space-y-1 sm:col-span-2">
                    <span className={opContextLabel}>{FIELD_AUTHORING_COPY.helpText}</span>
                    <input
                        className={inputClass}
                        disabled={disabled}
                        value={"description" in field ? field.description ?? "" : ""}
                        placeholder="Optional guidance shown under the question"
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

                <label className="flex items-center gap-2 self-end">
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
                    <span className={opMetadata}>{FIELD_AUTHORING_COPY.required}</span>
                </label>

                {field.type !== "group" ?
                    <label className="block space-y-1">
                        <span className={opContextLabel}>{FIELD_AUTHORING_COPY.layout}</span>
                        <select
                            className={selectClass}
                            disabled={disabled}
                            value={field.layout_width === "half" ? "half" : "full"}
                            onChange={(e) => {
                                const v = e.target.value === "half" ? "half" : "full";
                                onFieldChange(index, {
                                    ...field,
                                    ...(v === "full" ? { layout_width: undefined } : { layout_width: "half" }),
                                } as FormField);
                            }}
                            data-testid={`form-field-layout-${field.id}`}
                        >
                            {LAYOUT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                :   null}

                <label className="block space-y-1">
                    <span className={opContextLabel}>{FIELD_AUTHORING_COPY.answerType}</span>
                    <select
                        className={selectClass}
                        disabled={disabled || locked}
                        value={kind}
                        title={locked ? "Answer type is fixed for this mapped field." : undefined}
                        onChange={(e) => onPickerChange(index, `kind:${e.target.value}`)}
                        data-testid={`form-field-answer-type-${field.id}`}
                    >
                        {ANSWER_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>

                {field.type === "select" ?
                    <label className="block space-y-1 sm:col-span-2">
                        <span className={opContextLabel}>{FIELD_AUTHORING_COPY.options}</span>
                        <textarea
                            className={clsx(inputClass, "min-h-[5rem] font-mono text-xs")}
                            disabled={disabled}
                            value={staticOptionsToLines(field.static_options)}
                            placeholder="value|Label per line"
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
                : field.type === "text" ?
                    <label className="block space-y-1 sm:col-span-2">
                        <span className={opContextLabel}>{FIELD_AUTHORING_COPY.placeholder}</span>
                        <input
                            className={inputClass}
                            disabled={disabled}
                            value={field.placeholder ?? ""}
                            onChange={(e) => {
                                const v = e.target.value;
                                onFieldChange(index, {
                                    ...field,
                                    ...(v.trim() ? { placeholder: v } : { placeholder: undefined }),
                                } as FormField);
                            }}
                            data-testid={`form-field-placeholder-${field.id}`}
                        />
                    </label>
                :   null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-alloy-midnight/[0.06] pt-3">
                <button
                    type="button"
                    className={opActionLink}
                    disabled={disabled || index === 0}
                    onClick={() => onMove(index, -1)}
                    data-testid={`form-field-move-up-${field.id}`}
                >
                    {FIELD_AUTHORING_COPY.moveUp}
                </button>
                <button
                    type="button"
                    className={opActionLink}
                    disabled={disabled || index >= total - 1}
                    onClick={() => onMove(index, 1)}
                    data-testid={`form-field-move-down-${field.id}`}
                >
                    {FIELD_AUTHORING_COPY.moveDown}
                </button>
                <button
                    type="button"
                    className="text-xs font-semibold text-alloy-ember hover:underline disabled:opacity-40"
                    disabled={disabled || total <= 1}
                    onClick={() => onRemove(index)}
                    data-testid={`form-field-remove-${field.id}`}
                >
                    {FIELD_AUTHORING_COPY.remove}
                </button>
            </div>
        </li>
    );
}
