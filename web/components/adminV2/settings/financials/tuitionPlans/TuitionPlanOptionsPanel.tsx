"use client";

import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

export function TuitionPlanOptionsPanel({
    detail,
    canMutate,
    onScheduleChange,
    onManageCommitments,
    onGoToUpcoming,
    onGoToHistory,
}: {
    detail: TuitionPlanDetailVm;
    canMutate: boolean;
    onScheduleChange: () => void;
    onManageCommitments: () => void;
    onGoToUpcoming: () => void;
    onGoToHistory: () => void;
}) {
    const scheduledCount = detail.options.filter((row) => row.status === "scheduled").length;

    return (
        <div className="space-y-4" data-testid="tuition-plan-options-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Tuition Options</h3>
                    <p className="mt-0.5 text-sm text-alloy-midnight/55">
                        Current as of today · {detail.billingFrequencyLabel}
                    </p>
                </div>
                {canMutate ?
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={onScheduleChange}
                            data-testid="tuition-plan-options-schedule"
                        >
                            Schedule Change
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            onClick={onManageCommitments}
                            data-testid="tuition-plan-options-commitments"
                        >
                            Manage Commitments
                        </ConfigurationSecondaryButton>
                    </div>
                :   null}
            </div>

            {scheduledCount > 0 ?
                <p className="text-sm text-alloy-midnight/60">
                    {scheduledCount} scheduled change{scheduledCount === 1 ? "" : "s"}.{" "}
                    <button
                        type="button"
                        className="font-medium text-alloy-bend-pine hover:underline"
                        onClick={onGoToUpcoming}
                    >
                        View upcoming
                    </button>
                </p>
            :   null}

            <div className="process-config-setup-card overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm" data-testid="tuition-plan-options-table">
                    <thead>
                        <tr className="border-b border-alloy-stone/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            <th className="px-4 py-3">Enrollment Commitment</th>
                            <th className="px-4 py-3">Organization Price</th>
                            <th className="px-4 py-3">Location Differences</th>
                            <th className="px-4 py-3">Effective Since</th>
                            <th className="px-4 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-alloy-stone/15">
                        {detail.options.length === 0 ?
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-alloy-midnight/50">
                                    No Enrollment Commitments configured.
                                </td>
                            </tr>
                        :   detail.options.map((row) => (
                                <tr key={row.variantId} data-testid={`tuition-plan-option-${row.variantId}`}>
                                    <td className="px-4 py-3 font-medium text-alloy-midnight">
                                        {row.commitmentLabel}
                                    </td>
                                    <td className="px-4 py-3 text-alloy-midnight/75">{row.organizationPriceLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.locationDifferencesLabel}</td>
                                    <td className="px-4 py-3 text-alloy-midnight/60">{row.effectiveSinceLabel}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                row.status === "active"
                                                    ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                    : row.status === "scheduled"
                                                      ? "bg-alloy-stone/30 text-alloy-midnight/65"
                                                      : "bg-alloy-stone/20 text-alloy-midnight/50"
                                            }`}
                                        >
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>

            <p className="text-sm text-alloy-midnight/50">
                <button type="button" className="font-medium text-alloy-bend-pine hover:underline" onClick={onGoToHistory}>
                    View price history
                </button>
            </p>
        </div>
    );
}
