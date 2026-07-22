"use client";

import Link from "next/link";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { ProgramsLandingModel } from "@/lib/programs/programsOperatorLanding";

const LOCATION_PREVIEW_LIMIT = 8;

/**
 * Programs no-selection landing — calm orientation surface (not analytics / readiness).
 */
export function ProgramsOperatorLanding({
    model,
    locationsHref,
}: {
    model: ProgramsLandingModel;
    locationsHref: string;
}) {
    const previewLocations = model.locationRows.slice(0, LOCATION_PREVIEW_LIMIT);
    const hasMoreLocations = model.locationRows.length > LOCATION_PREVIEW_LIMIT;

    return (
        <div className="flex w-full flex-col gap-3" data-testid="programs-landing">
            <section
                className="process-config-setup-card p-5"
                data-testid="programs-landing-header"
            >
                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">Programs</h2>
                <p className="mt-1.5 max-w-2xl text-sm text-alloy-midnight/55">
                    A shared catalog of the Programs your organization offers.
                </p>
            </section>

            <div
                className="grid gap-3 sm:grid-cols-3"
                data-testid="programs-landing-summary"
            >
                <ConfigWorkspaceCard compact className="h-full" testId="programs-landing-active-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Active Programs
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {model.activeProgramCount}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="programs-landing-archived-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Archived Programs
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {model.archivedProgramCount}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="programs-landing-locations-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Locations Offering Programs
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {model.locationsOfferingCount}
                    </p>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="programs-landing-availability">
                <p className="text-sm font-semibold text-alloy-midnight">Program availability</p>
                {previewLocations.length === 0 ?
                    <p className="mt-3 text-sm text-alloy-midnight/55" data-testid="programs-landing-availability-empty">
                        No Programs are currently offered at Locations.
                    </p>
                :   <ul
                        className="mt-2 divide-y divide-alloy-forge/10"
                        data-testid="programs-landing-availability-list"
                    >
                        {previewLocations.map((row) => (
                            <li
                                key={row.locationId}
                                className="flex items-baseline justify-between gap-3 py-2.5 first:pt-1 last:pb-0"
                                data-testid={`programs-landing-location-${row.locationId}`}
                            >
                                <span className="min-w-0 truncate text-sm text-alloy-midnight">
                                    {row.locationLabel}
                                </span>
                                <span className="shrink-0 text-sm text-alloy-midnight/55">
                                    {row.activeProgramCount}{" "}
                                    {row.activeProgramCount === 1 ? "Program" : "Programs"}
                                </span>
                            </li>
                        ))}
                    </ul>
                }
                {hasMoreLocations ?
                    <Link
                        href={locationsHref}
                        className="mt-2 inline-flex text-sm font-medium text-alloy-bend-pine hover:underline"
                        data-testid="programs-landing-view-locations"
                    >
                        View Locations
                    </Link>
                :   null}
            </ConfigWorkspaceCard>

            {model.upcoming.length > 0 ?
                <ConfigWorkspaceCard compact testId="programs-landing-upcoming">
                    <p className="text-sm font-semibold text-alloy-midnight">Upcoming availability</p>
                    <ul className="mt-2 divide-y divide-alloy-forge/10" data-testid="programs-landing-upcoming-list">
                        {model.upcoming.map((item) => (
                            <li
                                key={`${item.programId}:${item.availableFrom}`}
                                className="py-2.5 first:pt-1 last:pb-0"
                                data-testid={`programs-landing-upcoming-${item.programId}`}
                            >
                                <p className="text-sm font-medium text-alloy-midnight">{item.programName}</p>
                                <p className="mt-0.5 text-sm text-alloy-midnight/55">{item.summaryLine}</p>
                            </li>
                        ))}
                    </ul>
                </ConfigWorkspaceCard>
            :   null}
        </div>
    );
}
