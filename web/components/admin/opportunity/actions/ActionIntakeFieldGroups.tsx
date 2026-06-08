"use client";

import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { ActionIntakePasteFieldMeta } from "@/lib/lifecycle/actionIntakePasteParserTypes";

const LABEL = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
const INPUT =
    "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

function tierLabel(tier: ActionIntakeFieldSpec["tier"]): string {
    if (tier === "required") return "Required";
    if (tier === "recommended") return "Recommended";
    return "Optional";
}

function assistBadge(meta: ActionIntakePasteFieldMeta | undefined): string | null {
    if (!meta?.from_paste) return null;
    if (meta.confidence === "high") return "BOS";
    return "Review";
}

type Props = {
    spec: ActionIntakeSpec;
    values: Record<string, string>;
    fieldMeta?: Record<string, ActionIntakePasteFieldMeta>;
    onFieldChange: (payloadKey: string, value: string) => void;
    disabled?: boolean;
    extraFields?: Array<{
        payload_key: string;
        field_label: string;
        tier: "optional";
        value_kind: "text";
        multiline?: boolean;
    }>;
    dataTestIdPrefix?: string;
};

export function ActionIntakeFieldGroups({
    spec,
    values,
    fieldMeta = {},
    onFieldChange,
    disabled = false,
    extraFields = [],
    dataTestIdPrefix = "action-intake",
}: Props) {
    const renderField = (field: ActionIntakeFieldSpec) => {
        const badge = assistBadge(fieldMeta[field.payload_key]);
        const inputType =
            field.value_kind === "email" ? "email" : field.value_kind === "phone" ? "tel" : field.value_kind === "date" ? "date" : "text";

        return (
            <div key={field.rule_id} data-testid={`${dataTestIdPrefix}-field-${field.rule_id}`}>
                <div className="flex items-baseline justify-between gap-2">
                    <div className={LABEL}>
                        {field.field_label}
                        {field.tier === "required" ?
                            <span className="text-alloy-ember"> *</span>
                        :   null}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {badge ?
                            <span
                                className={
                                    badge === "BOS" ?
                                        "rounded-full bg-alloy-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-alloy-blue"
                                    :   "rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                                }
                                data-testid={`${dataTestIdPrefix}-assist-badge-${field.payload_key}`}
                            >
                                {badge}
                            </span>
                        :   null}
                        <span className="text-[10px] text-alloy-midnight/45">{tierLabel(field.tier)}</span>
                    </div>
                </div>
                <input
                    value={values[field.payload_key] ?? ""}
                    disabled={disabled}
                    onChange={(e) => onFieldChange(field.payload_key, e.target.value)}
                    className={`${INPUT} mt-0.5`}
                    type={inputType}
                    autoComplete={
                        field.value_kind === "email" ? "email" : field.value_kind === "phone" ? "tel" : "off"
                    }
                    data-testid={`${dataTestIdPrefix}-input-${field.payload_key}`}
                />
            </div>
        );
    };

    return (
        <div className="space-y-4" data-testid={`${dataTestIdPrefix}-field-groups`}>
            {spec.groups.map((group) => (
                <section
                    key={group.entity}
                    className="space-y-2 rounded-xl border border-alloy-stone/12 bg-white p-3"
                    data-testid={`${dataTestIdPrefix}-group-${group.entity}`}
                >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        {group.entity_label}
                    </h3>
                    <div className="space-y-3">{group.fields.map(renderField)}</div>
                </section>
            ))}

            {extraFields.length > 0 ?
                <section
                    className="space-y-2 rounded-xl border border-alloy-stone/12 bg-white p-3"
                    data-testid={`${dataTestIdPrefix}-group-extra`}
                >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Additional details
                    </h3>
                    <div className="space-y-3">
                        {extraFields.map((field) => {
                            const badge = assistBadge(fieldMeta[field.payload_key]);
                            return (
                                <div key={field.payload_key} data-testid={`${dataTestIdPrefix}-field-${field.payload_key}`}>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className={LABEL}>{field.field_label}</div>
                                        {badge ?
                                            <span className="rounded-full bg-alloy-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-alloy-blue">
                                                {badge}
                                            </span>
                                        :   null}
                                    </div>
                                    {field.multiline ?
                                        <textarea
                                            value={values[field.payload_key] ?? ""}
                                            disabled={disabled}
                                            onChange={(e) => onFieldChange(field.payload_key, e.target.value)}
                                            rows={3}
                                            className={`${INPUT} mt-0.5 resize-y`}
                                            data-testid={`${dataTestIdPrefix}-input-${field.payload_key}`}
                                        />
                                    :   <input
                                            value={values[field.payload_key] ?? ""}
                                            disabled={disabled}
                                            onChange={(e) => onFieldChange(field.payload_key, e.target.value)}
                                            className={`${INPUT} mt-0.5`}
                                            type="text"
                                            data-testid={`${dataTestIdPrefix}-input-${field.payload_key}`}
                                        />
                                    }
                                </div>
                            );
                        })}
                    </div>
                </section>
            :   null}
        </div>
    );
}
