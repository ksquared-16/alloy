"use client";

/**
 * Business Process Overview tab — presentation only. Reads data already loaded by
 * LifecycleActivationBoard (builderStages, lifecycleName, tracks, runtime summary). Does not
 * fetch anything new and does not fabricate history or unproven location overrides.
 */

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigurationSecondaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY,
    BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_LABEL,
    BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_NOTE,
    BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_VALUE,
    BUSINESS_PROCESS_OVERVIEW_JOURNEY_EMPTY,
    BUSINESS_PROCESS_OVERVIEW_JOURNEY_TITLE,
    BUSINESS_PROCESS_OVERVIEW_OPEN_ACTIONS,
    BUSINESS_PROCESS_OVERVIEW_OPEN_STAGES,
    BUSINESS_PROCESS_OVERVIEW_OPEN_WORK_VIEWS,
    BUSINESS_PROCESS_OVERVIEW_OPERATOR_EXPERIENCE_TITLE,
    BUSINESS_PROCESS_OVERVIEW_READINESS_REVIEW,
    BUSINESS_PROCESS_OVERVIEW_READINESS_TITLE,
    BUSINESS_PROCESS_OVERVIEW_SNAPSHOT_TITLE,
    type BusinessProcessWorkspaceSection,
} from "@/lib/lifecycle/businessProcessUiLabels";

export type BusinessProcessOverviewRuntimeSummary = "unknown" | "pass" | "fail";

export default function BusinessProcessOverviewPanel({
    lifecycleName,
    isActive,
    stageLabels,
    trackLabels = null,
    workViewsCount,
    runtimeSummary,
    onNavigateSection,
}: {
    lifecycleName: string;
    isActive: boolean;
    stageLabels: string[];
    trackLabels?: string[] | null;
    /** Null when Work Views have not loaded yet — omitted rather than shown as zero. */
    workViewsCount: number | null;
    runtimeSummary: BusinessProcessOverviewRuntimeSummary;
    onNavigateSection: (section: BusinessProcessWorkspaceSection) => void;
}) {
    const stageCount = stageLabels.length;
    const readinessLabel =
        runtimeSummary === "pass" ? "Ready" : runtimeSummary === "fail" ? "Needs attention" : "Not yet checked";

    return (
        <div className="grid gap-4 md:grid-cols-2" data-testid="business-process-overview-panel">
            <ConfigWorkspaceCard title={BUSINESS_PROCESS_OVERVIEW_SNAPSHOT_TITLE} testId="business-process-overview-snapshot">
                <dl className="grid gap-3 text-sm">
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Process</dt>
                        <dd className="mt-0.5">{lifecycleName || "Untitled process"}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Status</dt>
                        <dd className="mt-0.5">{isActive ? "Active" : "Inactive"}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/40">Stages</dt>
                        <dd className="mt-0.5">
                            {stageCount} stage{stageCount === 1 ? "" : "s"}
                        </dd>
                    </div>
                    {trackLabels && trackLabels.length > 0 ?
                        <div>
                            <dt className="text-[11px] font-medium text-alloy-midnight/40">Tracks</dt>
                            <dd className="mt-0.5">{trackLabels.join(" · ")}</dd>
                        </div>
                    :   null}
                    <div>
                        <dt className="text-[11px] font-medium text-alloy-midnight/40">
                            {BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_LABEL}
                        </dt>
                        <dd className="mt-0.5">{BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_VALUE}</dd>
                        <dd
                            className="mt-1 text-xs leading-5 text-alloy-midnight/50"
                            data-capability="planned"
                            data-testid="business-process-overview-location-planned"
                        >
                            {BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_NOTE}
                        </dd>
                    </div>
                </dl>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard title={BUSINESS_PROCESS_OVERVIEW_JOURNEY_TITLE} testId="business-process-overview-journey">
                {stageCount === 0 ?
                    <p className="text-sm text-alloy-midnight/55">{BUSINESS_PROCESS_OVERVIEW_JOURNEY_EMPTY}</p>
                :   <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Process stage journey">
                        {stageLabels.map((label, index) => (
                            <li key={`${label}-${index}`} className="flex items-center gap-1.5">
                                <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2.5 py-1 font-medium text-alloy-midnight">
                                    {label}
                                </span>
                                {index < stageLabels.length - 1 ?
                                    <span className="text-alloy-midnight/30" aria-hidden>
                                        →
                                    </span>
                                :   null}
                            </li>
                        ))}
                    </ol>
                }
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard
                title={BUSINESS_PROCESS_OVERVIEW_OPERATOR_EXPERIENCE_TITLE}
                testId="business-process-overview-operator-experience"
            >
                <dl className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-alloy-midnight/60">Stages</dt>
                        <dd className="font-medium text-alloy-midnight">{stageCount}</dd>
                    </div>
                    {workViewsCount !== null ?
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-alloy-midnight/60">Work Views</dt>
                            <dd className="font-medium text-alloy-midnight">{workViewsCount}</dd>
                        </div>
                    :   null}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                    <ConfigurationSecondaryButton
                        onClick={() => onNavigateSection("stages")}
                        data-testid="business-process-overview-open-stages"
                    >
                        {BUSINESS_PROCESS_OVERVIEW_OPEN_STAGES}
                    </ConfigurationSecondaryButton>
                    <ConfigurationSecondaryButton
                        onClick={() => onNavigateSection("work-views")}
                        data-testid="business-process-overview-open-work-views"
                    >
                        {BUSINESS_PROCESS_OVERVIEW_OPEN_WORK_VIEWS}
                    </ConfigurationSecondaryButton>
                    <ConfigurationSecondaryButton
                        onClick={() => onNavigateSection("actions")}
                        data-testid="business-process-overview-open-actions"
                    >
                        {BUSINESS_PROCESS_OVERVIEW_OPEN_ACTIONS}
                    </ConfigurationSecondaryButton>
                </div>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard
                title={BUSINESS_PROCESS_OVERVIEW_READINESS_TITLE}
                testId="business-process-overview-readiness"
            >
                <p className="text-sm text-alloy-midnight/70">{readinessLabel}</p>
                <p className="mt-1 text-xs leading-5 text-alloy-midnight/50">
                    {BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY}
                </p>
                <ConfigurationSecondaryButton
                    className="mt-3"
                    onClick={() => onNavigateSection("health")}
                    data-testid="business-process-overview-review-health"
                >
                    {BUSINESS_PROCESS_OVERVIEW_READINESS_REVIEW}
                </ConfigurationSecondaryButton>
            </ConfigWorkspaceCard>
        </div>
    );
}
