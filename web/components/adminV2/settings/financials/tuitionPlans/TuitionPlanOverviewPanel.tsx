"use client";

import Link from "next/link";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { organizationFinancialsChapterHref } from "@/lib/commercial/commercialChapterRoutes";
import {
    derivePlanReadinessChip,
    type TuitionPlanDetailVm,
} from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

export function TuitionPlanOverviewPanel({
    detail,
    onViewOptions,
    onCompare,
    onSetTuition,
}: {
    detail: TuitionPlanDetailVm;
    onViewOptions?: () => void;
    onCompare?: () => void;
    onSetTuition?: () => void;
}) {
    const readiness = derivePlanReadinessChip(detail);
    const locationDiffCount = detail.locationsWithOverrides.length;

    return (
        <div className="space-y-4" data-testid="tuition-plan-overview-panel">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <section className="process-config-setup-card p-5" data-testid="tuition-plan-snapshot-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-alloy-midnight">
                                {detail.programLabel} {detail.name}
                            </h3>
                            <p className="mt-1 text-sm text-alloy-midnight/55">
                                {detail.enrollmentOptionsCount}{" "}
                                {detail.enrollmentOptionsCount === 1 ? "commitment" : "commitments"}
                                {" · "}
                                {detail.billingFrequencyLabel}
                                {" · "}
                                {detail.appliesToLabel}
                            </p>
                        </div>
                        <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                readiness.chip === "ready"
                                    ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                    : "bg-alloy-stone/25 text-alloy-midnight/60"
                            }`}
                            data-testid="tuition-plan-readiness-chip"
                            data-readiness={readiness.chip}
                        >
                            {readiness.label}
                        </span>
                    </div>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                        <div>
                            <dt className="text-[11px] font-medium text-alloy-midnight/40">Program</dt>
                            <dd className="mt-0.5 text-alloy-midnight/70">{detail.programLabel}</dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium text-alloy-midnight/40">Care format</dt>
                            <dd className="mt-0.5 text-alloy-midnight/70">{detail.careFormatLabel}</dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium text-alloy-midnight/40">Revenue GL</dt>
                            <dd className="mt-0.5 text-alloy-midnight/70">
                                {detail.revenueGlAccountId ?
                                    <Link
                                        href={organizationFinancialsChapterHref("accounting", {
                                            accountId: detail.revenueGlAccountId,
                                        })}
                                        className="text-alloy-bend-pine hover:underline"
                                        data-testid="tuition-plan-open-gl"
                                    >
                                        {detail.revenueGlLabel ?? "Open GL Code"}
                                    </Link>
                                : detail.revenueGlLabel ?
                                    detail.revenueGlLabel
                                :   <Link
                                        href={organizationFinancialsChapterHref("accounting")}
                                        className="text-alloy-bend-pine hover:underline"
                                        data-testid="tuition-plan-setup-gl"
                                    >
                                        Not set · Set up GL Codes →
                                    </Link>
                                }
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium text-alloy-midnight/40">Applies to</dt>
                            <dd className="mt-0.5 text-alloy-midnight/70">{detail.appliesToLabel}</dd>
                        </div>
                    </dl>
                </section>

                <section className="process-config-setup-card p-5" data-testid="tuition-plan-current-tuition-card">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Current Tuition</h3>
                    {detail.priceRangeLabel ?
                        <p className="mt-2 text-lg font-semibold tracking-tight text-alloy-midnight">
                            {detail.priceRangeLabel}
                        </p>
                    :   <p className="mt-2 text-sm text-alloy-midnight/55">No organization prices set yet.</p>}

                    {detail.options.length > 0 ?
                        <ul className="mt-3 space-y-1.5">
                            {detail.options
                                .filter((row) => row.status === "active" || row.status === "scheduled")
                                .map((row) => (
                                    <li
                                        key={row.variantId}
                                        className="flex items-baseline justify-between gap-3 text-sm"
                                    >
                                        <span className="text-alloy-midnight/75">{row.commitmentLabel}</span>
                                        <span className="font-medium text-alloy-midnight">{row.organizationPriceLabel}</span>
                                    </li>
                                ))}
                        </ul>
                    :   null}

                    <div className="mt-3 space-y-1 text-sm text-alloy-midnight/55">
                        {locationDiffCount > 0 ?
                            <p>
                                {locationDiffCount} location{locationDiffCount === 1 ? "" : "s"} with price
                                differences
                            </p>
                        :   null}
                        {detail.upcomingChange ?
                            <p>Next change: {detail.upcomingChange.effectiveDateLabel}</p>
                        :   null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {onViewOptions ?
                            <ConfigurationSecondaryButton onClick={onViewOptions} data-testid="tuition-overview-view-options">
                                View Tuition Options
                            </ConfigurationSecondaryButton>
                        :   null}
                        {onCompare ?
                            <ConfigurationSecondaryButton onClick={onCompare} data-testid="tuition-overview-compare">
                                Compare
                            </ConfigurationSecondaryButton>
                        :   null}
                        {onSetTuition ?
                            <ConfigurationPrimaryButton onClick={onSetTuition} data-testid="tuition-overview-set-tuition">
                                Set Tuition
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                </section>
            </div>

            {detail.locationsWithOverrides.length > 0 ?
                <section className="process-config-setup-card p-5" data-testid="tuition-plan-overview-locations">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Location differences</h3>
                    <ul className="mt-3 space-y-2">
                        {detail.locationsWithOverrides.map((row) => (
                            <li
                                key={row.locationId}
                                className="flex items-baseline justify-between gap-3 text-sm"
                                data-testid={`tuition-plan-overview-location-${row.locationId}`}
                            >
                                <span className="font-medium text-alloy-midnight">{row.locationName}</span>
                                <span className="text-alloy-midnight/55">
                                    {row.overrideCount} override{row.overrideCount === 1 ? "" : "s"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            :   null}

            {detail.upcomingChange ?
                <section
                    className="process-config-setup-card border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.04] p-5"
                    data-testid="tuition-plan-overview-upcoming"
                >
                    <h3 className="text-sm font-semibold text-alloy-midnight">Upcoming change</h3>
                    <p className="mt-2 text-sm text-alloy-midnight/70">{detail.upcomingChange.summary}</p>
                    <p className="mt-1 text-sm font-medium text-alloy-bend-pine">
                        Effective {detail.upcomingChange.effectiveDateLabel}
                    </p>
                </section>
            :   null}
        </div>
    );
}
