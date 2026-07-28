"use client";

/**
 * Builder V3 — Population / Equivalency / Compare composer.
 */

import { useMemo } from "react";
import {
    compilePivotBuilderDraft,
    listPivotValueChoices,
    roomUtilizationPivotDraft,
    type PivotBuilderDraft,
    type PivotOperatorLabel,
} from "@/lib/organizationCalculations/pivotBuilder";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import { inferProductTypeFromAst, type OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

const OPERATORS: PivotOperatorLabel[] = [
    "Add",
    "Subtract",
    "Multiply",
    "Divide",
    "Minimum of",
    "Maximum of",
    "Use first available value",
];

export type PopulationOption = { versionId: string; label: string };
export type WeightingOption = { versionId: string; label: string };

export type OrgCalcPivotBuilderProps = {
    draft: PivotBuilderDraft;
    onChange: (next: PivotBuilderDraft) => void;
    disabled?: boolean;
    populations?: PopulationOption[];
    weightings?: WeightingOption[];
};

export function defaultPivotDraftForProduct(productTypeId: OrgCalcProductTypeId): PivotBuilderDraft {
    if (productTypeId === "room_utilization_pct" || productTypeId === "room_utilization_fte_pct") {
        return roomUtilizationPivotDraft();
    }
    if (productTypeId === "equivalent_child_count") {
        return {
            name: "Equivalent Child Count",
            grain: "room",
            valueMode: "equivalent_count",
            populationVersionId: null,
            weightingVersionId: null,
            compareRef: null,
            operator: "Add",
            asPercentage: false,
            outputUnit: "children",
        };
    }
    if (productTypeId === "capacity_operational_with_fallback") {
        return {
            name: "Operational seats when available",
            grain: "room",
            valueMode: "catalog_input",
            valueRef: "capacity.room_binding.operational",
            compareRef: "capacity.room_binding.physical",
            operator: "Use first available value",
            asPercentage: false,
            outputUnit: "seats",
        };
    }
    return {
        name: "Lower of physical and licensed seats",
        grain: "room",
        valueMode: "catalog_input",
        valueRef: "capacity.room_binding.physical",
        compareRef: "capacity.room_binding.licensed",
        operator: "Minimum of",
        asPercentage: false,
        outputUnit: "seats",
    };
}

export default function OrgCalcPivotBuilder({
    draft,
    onChange,
    disabled,
    populations = [],
    weightings = [],
}: OrgCalcPivotBuilderProps) {
    const choices = useMemo(() => listPivotValueChoices(), []);
    const previewAst = useMemo(() => {
        try {
            return compilePivotBuilderDraft(draft);
        } catch {
            return null;
        }
    }, [draft]);
    const inferred = previewAst ? inferProductTypeFromAst(previewAst) : null;

    return (
        <div className="space-y-3" data-testid="org-calc-pivot-builder">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Definition
                </p>
                <p className="mt-0.5 text-sm font-medium text-alloy-midnight">For each room</p>
            </div>

            <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5 space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Build the answer
                </p>

                <label className="block space-y-1">
                    <span className="config-typo-field-label">Count</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.valueMode}
                        onChange={(e) => {
                            const mode = e.target.value as PivotBuilderDraft["valueMode"];
                            onChange({
                                ...draft,
                                valueMode: mode,
                                asPercentage: mode === "equivalent_count" ? draft.asPercentage : draft.asPercentage,
                            });
                        }}
                        data-testid="pivot-value-mode"
                    >
                        <option value="catalog_input">An approved fact</option>
                        <option value="equivalent_count">Children in a population</option>
                    </select>
                </label>

                {draft.valueMode === "equivalent_count" ?
                    <>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Population</span>
                            <select
                                className="config-runtime-input"
                                disabled={disabled}
                                value={draft.populationVersionId ?? ""}
                                onChange={(e) =>
                                    onChange({ ...draft, populationVersionId: e.target.value || null })
                                }
                                data-testid="pivot-population-version"
                            >
                                <option value="">Select population…</option>
                                {populations.map((p) => (
                                    <option key={p.versionId} value={p.versionId}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">How should they count?</span>
                            <select
                                className="config-runtime-input"
                                disabled={disabled}
                                value={draft.weightingVersionId ?? ""}
                                onChange={(e) =>
                                    onChange({ ...draft, weightingVersionId: e.target.value || null })
                                }
                                data-testid="pivot-weighting-version"
                            >
                                <option value="">How should they count…</option>
                                {weightings.map((w) => (
                                    <option key={w.versionId} value={w.versionId}>
                                        {w.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                :   <label className="block space-y-1">
                        <span className="config-typo-field-label">Value</span>
                        <select
                            className="config-runtime-input"
                            disabled={disabled}
                            value={draft.valueRef ?? ""}
                            onChange={(e) =>
                                onChange({ ...draft, valueRef: e.target.value as ApprovedInputRef })
                            }
                            data-testid="pivot-value-ref"
                        >
                            {choices.map((c) => (
                                <option key={c.ref} value={c.ref}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </label>
                }

                <label className="block space-y-1">
                    <span className="config-typo-field-label">Then</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.operator}
                        onChange={(e) =>
                            onChange({ ...draft, operator: e.target.value as PivotOperatorLabel })
                        }
                        data-testid="pivot-operator"
                    >
                        {OPERATORS.map((op) => (
                            <option key={op} value={op}>
                                {op}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1">
                    <span className="config-typo-field-label">Compare against</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.compareRef ?? ""}
                        onChange={(e) =>
                            onChange({
                                ...draft,
                                compareRef: (e.target.value || null) as ApprovedInputRef | null,
                            })
                        }
                        data-testid="pivot-compare-ref"
                    >
                        <option value="">No comparison</option>
                        {choices.map((c) => (
                            <option key={c.ref} value={c.ref}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        disabled={disabled}
                        checked={draft.asPercentage}
                        onChange={(e) =>
                            onChange({
                                ...draft,
                                asPercentage: e.target.checked,
                                outputUnit: e.target.checked ? "percent" : draft.outputUnit === "percent" ? "number" : draft.outputUnit,
                            })
                        }
                        data-testid="pivot-as-percentage"
                    />
                    <span>Display as percentage (× 100)</span>
                </label>
            </div>

            <div className="rounded-md border border-alloy-forge/10 bg-[#00a283]/5 px-3 py-2 text-sm text-alloy-midnight/80">
                <span className="font-medium text-alloy-midnight">Result: </span>
                {draft.asPercentage ? "Percentage"
                : draft.outputUnit === "children" ? "Equivalent children"
                : "Number"}
                {inferred ? ` · ${inferred.title}` : ""}
            </div>
        </div>
    );
}
