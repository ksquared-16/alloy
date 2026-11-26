"use client";

/**
 * Builder V3 — Population / Equivalency / Compare composer.
 */

import { AlloySelect } from "@/components/workspace/AlloySelect";
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

/** Fixed vocabulary — the two things a pivot can count. */
const VALUE_MODE_OPTIONS = [
    { value: "catalog_input", label: "An approved fact" },
    { value: "equivalent_count", label: "Children in a population" },
] as const;

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
                    <AlloySelect
                        triggerClassName="config-runtime-input"
                        disabled={disabled}
                        allowEmpty={false}
                        value={draft.valueMode}
                        options={VALUE_MODE_OPTIONS}
                        aria-label="Count"
                        testId="pivot-value-mode"
                        onChange={(next) => {
                            const mode = next as PivotBuilderDraft["valueMode"];
                            onChange({
                                ...draft,
                                valueMode: mode,
                                asPercentage: mode === "equivalent_count" ? draft.asPercentage : draft.asPercentage,
                            });
                        }}
                    />
                </label>

                {draft.valueMode === "equivalent_count" ?
                    <>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Population</span>
                            <AlloySelect
                                triggerClassName="config-runtime-input"
                                disabled={disabled}
                                placeholder="Select population…"
                                value={draft.populationVersionId ?? ""}
                                options={populations.map((p) => ({ value: p.versionId, label: p.label }))}
                                aria-label="Population"
                                testId="pivot-population-version"
                                onChange={(next) =>
                                    onChange({ ...draft, populationVersionId: next || null })
                                }
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">How should they count?</span>
                            <AlloySelect
                                triggerClassName="config-runtime-input"
                                disabled={disabled}
                                placeholder="How should they count…"
                                value={draft.weightingVersionId ?? ""}
                                options={weightings.map((w) => ({ value: w.versionId, label: w.label }))}
                                aria-label="How should they count?"
                                testId="pivot-weighting-version"
                                onChange={(next) =>
                                    onChange({ ...draft, weightingVersionId: next || null })
                                }
                            />
                        </label>
                    </>
                :   <label className="block space-y-1">
                        <span className="config-typo-field-label">Value</span>
                        <AlloySelect
                            triggerClassName="config-runtime-input"
                            disabled={disabled}
                            allowEmpty={false}
                            placeholder="No approved facts available"
                            value={draft.valueRef ?? ""}
                            options={choices.map((c) => ({ value: c.ref, label: c.label }))}
                            aria-label="Value"
                            testId="pivot-value-ref"
                            onChange={(next) =>
                                onChange({ ...draft, valueRef: next as ApprovedInputRef })
                            }
                        />
                    </label>
                }

                <label className="block space-y-1">
                    <span className="config-typo-field-label">Then</span>
                    <AlloySelect
                        triggerClassName="config-runtime-input"
                        disabled={disabled}
                        allowEmpty={false}
                        value={draft.operator}
                        options={OPERATORS.map((op) => ({ value: op, label: op }))}
                        aria-label="Then"
                        testId="pivot-operator"
                        onChange={(next) =>
                            onChange({ ...draft, operator: next as PivotOperatorLabel })
                        }
                    />
                </label>

                <label className="block space-y-1">
                    <span className="config-typo-field-label">Compare against</span>
                    <AlloySelect
                        triggerClassName="config-runtime-input"
                        disabled={disabled}
                        placeholder="No comparison"
                        value={draft.compareRef ?? ""}
                        options={choices.map((c) => ({ value: c.ref, label: c.label }))}
                        aria-label="Compare against"
                        testId="pivot-compare-ref"
                        onChange={(next) =>
                            onChange({
                                ...draft,
                                compareRef: (next || null) as ApprovedInputRef | null,
                            })
                        }
                    />
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
