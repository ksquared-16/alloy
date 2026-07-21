"use client";

import Link from "next/link";
import { LibraryBig } from "lucide-react";
import { useRouter } from "next/navigation";
import ProgramsLocationsLanding from "@/components/adminV2/settings/organization/ProgramsLocationsLanding";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigScopeContextBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { CANONICAL_ORGANIZATION_BASE } from "@/lib/admin/canonicalAdminRoutes";
import { PROGRAMS_LOCATIONS_LANDING_SUBTITLE } from "@/lib/configRuntime/programsLocationsLandingModel";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";
import { useEffect } from "react";
import { buildProgramsLocationsLandingTiles } from "@/lib/configRuntime/programsLocationsLandingModel";

/**
 * Organization Programs & Locations — relationship landing only.
 * Collections remain at `/organization/programs` and `/organization/locations`.
 */
export default function ProgramsLocationsPublicationWorkspace() {
    const router = useRouter();

    useEffect(() => {
        for (const tile of buildProgramsLocationsLandingTiles()) {
            void prepareConfigurationSoftNavTarget(tile.href, (href) => router.prefetch(href));
        }
    }, [router]);

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="programs-locations-configuration-page">
            <div className="w-full" data-testid="programs-locations-content-column">
                <ConfigurationContext
                    title="Programs & Locations"
                    subtitle={PROGRAMS_LOCATIONS_LANDING_SUBTITLE}
                    titleIcon={<LibraryBig className="h-5 w-5" strokeWidth={2} />}
                    testId="programs-locations-landing-context"
                >
                    <div
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2"
                        data-testid="programs-locations-landing-posture"
                    >
                        <ConfigScopeContextBar
                            mode="organization"
                            organizationLabel="Organization"
                            objectLabel="Programs & Locations"
                            ownershipHint="Service definitions and delivery places"
                            onModeChange={(mode) => {
                                if (mode === "organization") {
                                    router.push(CANONICAL_ORGANIZATION_BASE);
                                }
                            }}
                        />
                        <ul
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/52"
                            aria-label="Programs & Locations breadcrumb"
                        >
                            <li>
                                <Link
                                    href={CANONICAL_ORGANIZATION_BASE}
                                    className="font-medium hover:text-alloy-bend-pine"
                                >
                                    Organization
                                </Link>
                                <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                    ›
                                </span>
                                <span className="font-semibold text-alloy-midnight/70">
                                    Programs & Locations
                                </span>
                            </li>
                        </ul>
                    </div>
                </ConfigurationContext>
            </div>

            <ConfigurationShell testId="programs-locations-landing-shell">
                <main
                    className="mx-auto min-w-0 max-w-[1480px] space-y-2.5 pb-3"
                    data-testid="programs-locations-landing-workspace"
                >
                    <ProgramsLocationsLanding />
                </main>
            </ConfigurationShell>
        </div>
    );
}
