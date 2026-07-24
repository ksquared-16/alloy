"use client";

import { CompactConfigurationLauncher } from "@/components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher";
import { buildProgramsLocationsLandingTiles } from "@/lib/configRuntime/programsLocationsLandingModel";

export default function ProgramsLocationsLanding() {
    const tiles = buildProgramsLocationsLandingTiles();

    return (
        <CompactConfigurationLauncher
            testId="programs-locations-landing"
            continuitySurface="programs_locations_landing"
            helper="Programs are authored once and assigned to Locations."
            columnsClassName="md:grid-cols-2"
            items={tiles.map((section) => ({
                id: section.id,
                label: section.label,
                summary: section.summary,
                href: section.href,
                includes: section.capabilities.slice(0, 3),
            }))}
        />
    );
}
