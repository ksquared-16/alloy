"use client";

import { useMemo, useState } from "react";
import { ConfigurationSecondaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { buildCompareLocationsMatrix } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";
import { todayIso } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";

export function TuitionPlanCompareDialog({
    detail,
    snapshot,
    onClose,
}: {
    detail: TuitionPlanDetailVm;
    snapshot: TuitionPlansSnapshot;
    onClose: () => void;
}) {
    const [effectiveDate, setEffectiveDate] = useState(todayIso());
    const [onlyDifferences, setOnlyDifferences] = useState(false);

    const matrix = useMemo(
        () =>
            buildCompareLocationsMatrix({
                variants: detail.variants,
                rates: snapshot.rates,
                locations: snapshot.locations,
                cadenceKey: detail.billingFrequencyKey,
                asOf: effectiveDate || todayIso(),
            }),
        [detail.billingFrequencyKey, detail.variants, effectiveDate, snapshot.locations, snapshot.rates],
    );

    const visibleCommitments = onlyDifferences
        ? matrix.commitments.filter((commitment) =>
              matrix.columns.some(
                  (column) =>
                      column.key !== "organization" && matrix.cells[commitment]?.[column.key]?.differs,
              ),
          )
        : matrix.commitments;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/25 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuition-compare-title"
            data-testid="tuition-plan-compare-dialog"
        >
            <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-alloy-stone/25 bg-white shadow-sm">
                <div className="border-b border-alloy-stone/20 px-5 py-4">
                    <h2 id="tuition-compare-title" className="text-lg font-semibold text-alloy-midnight">
                        Compare Locations
                    </h2>
                    <p className="mt-1 text-sm text-alloy-midnight/55">{detail.name}</p>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-b border-alloy-stone/15 px-5 py-3">
                    <label className="flex items-center gap-2 text-sm text-alloy-midnight/70">
                        <span>Effective date</span>
                        <input
                            type="date"
                            value={effectiveDate}
                            onChange={(event) => setEffectiveDate(event.target.value)}
                            className="config-runtime-input"
                            data-testid="tuition-compare-effective-date"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={onlyDifferences}
                            onChange={(event) => setOnlyDifferences(event.target.checked)}
                            data-testid="tuition-compare-differences-only"
                        />
                        Show only differences
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                    {visibleCommitments.length === 0 ?
                        <p className="text-sm text-alloy-midnight/55">No differences to show.</p>
                    :   <table className="w-full min-w-[48rem] text-left text-sm" data-testid="tuition-compare-matrix">
                            <thead>
                                <tr className="border-b border-alloy-stone/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                    <th className="sticky left-0 bg-white px-3 py-2">Enrollment Commitment</th>
                                    {matrix.columns.map((column) => (
                                        <th key={column.key} className="px-3 py-2 whitespace-nowrap">
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-alloy-stone/15">
                                {visibleCommitments.map((commitment) => (
                                    <tr key={commitment}>
                                        <td className="sticky left-0 bg-white px-3 py-2 font-medium text-alloy-midnight">
                                            {commitment}
                                        </td>
                                        {matrix.columns.map((column) => {
                                            const cell = matrix.cells[commitment]?.[column.key];
                                            return (
                                                <td
                                                    key={column.key}
                                                    className={`px-3 py-2 ${
                                                        cell?.differs
                                                            ? "bg-alloy-bend-pine/[0.06] font-medium text-alloy-midnight"
                                                            : "text-alloy-midnight/70"
                                                    }`}
                                                >
                                                    {cell?.label ?? "—"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    }
                </div>

                <div className="flex justify-end border-t border-alloy-stone/20 px-5 py-4">
                    <ConfigurationSecondaryButton onClick={onClose} data-testid="tuition-compare-close">
                        Close
                    </ConfigurationSecondaryButton>
                </div>
            </div>
        </div>
    );
}
