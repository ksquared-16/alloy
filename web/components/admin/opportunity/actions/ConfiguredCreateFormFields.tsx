"use client";

import type { EntityCreateFormField } from "@/lib/admin/actions/entityCreateFormFieldLoader";

const INPUT =
    "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-[rgba(0,162,131,0.45)] focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60";

type Props = {
    fields: EntityCreateFormField[];
    values: Record<string, string>;
    onChange: (fieldKey: string, value: string) => void;
    disabled?: boolean;
    dataPrefix?: string;
};

function inputTypeForField(field: EntityCreateFormField): string {
    if (field.field_type === "date") return "date";
    if (field.field_type === "phone") return "tel";
    if (field.field_type === "email" || field.field_key === "email") return "email";
    return "text";
}

/** Renders configured create-form field definitions for drawer action modals. */
export default function ConfiguredCreateFormFields({
    fields,
    values,
    onChange,
    disabled = false,
    dataPrefix = "configured-create",
}: Props) {
    if (fields.length === 0) {
        return (
            <p className="text-sm text-alloy-midnight/60" data-configured-create-form-empty="true">
                No configured create fields are available for this action.
            </p>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3" data-configured-create-form="true">
            {fields.map((field) => (
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
                    <input
                        type={inputTypeForField(field)}
                        value={values[field.field_key] ?? ""}
                        onChange={(e) => onChange(field.field_key, e.target.value)}
                        className={INPUT}
                        disabled={disabled}
                        placeholder={field.placeholder ?? undefined}
                        data-configured-create-field={field.field_key}
                    />
                </label>
            ))}
        </div>
    );
}
