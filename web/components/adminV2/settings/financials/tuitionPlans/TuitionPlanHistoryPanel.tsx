"use client";

import { useMemo } from "react";
import { buildTuitionHistoryPeriods } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";

export function TuitionPlanHistoryPanel({
    detail,
    snapshot,
}: {
    detail: TuitionPlanDetailVm;
    snapshot: TuitionPlansSnapshot;
}) {
    const periods = useMemo(
        () =>
            buildTuitionHistoryPeriods({
                variants: detail.variants,
                rates: snapshot.rates,
                cadenceKey: detail.billingFrequencyKey,
            }),
        [detail.billingFrequencyKey, detail.variants, snapshot.rates],
    );

    return (
        <div className="space-y-4" data-testid="tuition-plan-history-panel">
            <h3 className="text-sm font-semibold text-alloy-midnight">Price history</h3>
            {periods.length === 0 ?
                <p className="text-sm text-alloy-midnight/55">No price history recorded yet.</p>
            :   <div className="space-y-3">
                    {periods.map((period) => (
                        <section
                            key={period.key}
                            className="process-config-setup-card p-4"
                            data-testid={`tuition-plan-history-period-${period.key}`}
                        >
                            <h4 className="text-sm font-semibold text-alloy-midnight">{period.label}</h4>
                            <ul className="mt-3 space-y-2">
                                {period.rows.map((row, index) => (
                                    <li
                                        key={`${period.key}-${row.commitmentLabel}-${index}`}
                                        className="flex items-baseline justify-between gap-3 text-sm"
                                    >
                                        <span className="text-alloy-midnight/75">{row.commitmentLabel}</span>
                                        <span className="font-medium text-alloy-midnight">{row.priceLabel}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            }
        </div>
    );
}

export function TuitionPlanUpcomingPanel({ detail }: { detail: TuitionPlanDetailVm }) {
    const scheduled = detail.options.filter((row) => row.status === "scheduled");

    return (
        <div className="space-y-4" data-testid="tuition-plan-upcoming-panel">
            <h3 className="text-sm font-semibold text-alloy-midnight">Upcoming Changes</h3>
            {detail.upcomingChange ?
                <section className="process-config-setup-card border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.04] p-4">
                    <p className="text-sm text-alloy-midnight/70">{detail.upcomingChange.summary}</p>
                    <p className="mt-1 text-sm font-medium text-alloy-bend-pine">
                        Effective {detail.upcomingChange.effectiveDateLabel}
                    </p>
                </section>
            :   null}
            {scheduled.length === 0 && !detail.upcomingChange ?
                <p className="text-sm text-alloy-midnight/55">No upcoming changes scheduled.</p>
            :   scheduled.length > 0 ?
                <div className="process-config-setup-card overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                        <thead>
                            <tr className="border-b border-alloy-stone/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                <th className="px-4 py-3">Enrollment Commitment</th>
                                <th className="px-4 py-3">Scheduled price</th>
                                <th className="px-4 py-3">Effective Since</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-alloy-stone/15">
                            {scheduled.map((row) => (
                                <tr key={row.variantId}>
                                    <td className="px-4 py-3 font-medium text-alloy-midnight">{row.commitmentLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/75">{row.organizationPriceLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.effectiveSinceLabel}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            :   null}
        </div>
    );
}
