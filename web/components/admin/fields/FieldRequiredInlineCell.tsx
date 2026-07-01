"use client";

import {
    OPERATOR_REQUIREMENT_INLINE_OPTIONS,
    operatorRequirementLockedReason,
} from "@/lib/fields/fieldSettingsOperatorUi";
import type { FieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";
import {
    inlineRequirementCellMode,
    resolveInlineRequirementPreset,
    type InlineRequirementRow,
} from "@/lib/fields/fieldRequiredInlineUi";
import type { FieldPolicyRequirementPreset } from "@/lib/fields/fieldPolicySettingsUi";

export type FieldRequiredInlineCellProps = {
    entityType: string;
    row: InlineRequirementRow;
    policyView: FieldPolicySettingsView | null;
    canMutate: boolean;
    displayLabel: string;
    presetOverride?: FieldPolicyRequirementPreset | null;
    saving?: boolean;
    saved?: boolean;
    rowError?: string | null;
    onPresetChange: (preset: FieldPolicyRequirementPreset) => void;
};

export default function FieldRequiredInlineCell({
    entityType,
    row,
    policyView,
    canMutate,
    displayLabel,
    presetOverride,
    saving = false,
    saved = false,
    rowError = null,
    onPresetChange,
}: FieldRequiredInlineCellProps) {
    const mode = inlineRequirementCellMode(entityType, canMutate, policyView);

    if (mode === "editable") {
        const value = resolveInlineRequirementPreset(row, policyView, presetOverride);
        return (
            <div className="flex min-w-[11rem] flex-col gap-0.5">
                <select
                    value={value}
                    disabled={saving}
                    onChange={(e) => onPresetChange(e.target.value as FieldPolicyRequirementPreset)}
                    className="w-full min-w-[11rem] rounded-md border border-[#c4c8cc] bg-white px-2 py-1.5 text-sm text-[#31394d] shadow-sm"
                    aria-label={`Required for ${displayLabel}`}
                >
                    {OPERATOR_REQUIREMENT_INLINE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {rowError ? (
                    <span className="text-[10px] text-red-600">{rowError}</span>
                ) : saving ? (
                    <span className="text-[10px] text-alloy-midnight/50">Saving…</span>
                ) : saved ? (
                    <span className="text-[10px] font-medium text-alloy-pine">Saved</span>
                ) : null}
            </div>
        );
    }

    if (mode === "locked" && policyView) {
        const reason = operatorRequirementLockedReason(entityType, row.field_key, policyView);
        return (
            <div className="max-w-[14rem] text-sm text-[#59678b]">
                <span className="text-alloy-midnight/70">{reason || "Managed elsewhere"}</span>
            </div>
        );
    }

    return (
        <span className="text-sm text-[#59678b]">{row.is_required ? "Required" : "Optional"}</span>
    );
}
