"use client";

import { LibraryBig } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProgramsLocationsLanding from "@/components/adminV2/settings/organization/ProgramsLocationsLanding";
import { CompactGroupedLandingShell } from "@/components/adminV2/settings/configurationRuntime/CompactGroupedLandingShell";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";
import { buildProgramsLocationsLandingTiles } from "@/lib/configRuntime/programsLocationsLandingModel";

/**
 * Organization Programs & Locations — relationship landing only.
 * Collections remain at `/organization/programs` and `/organization/locations`.
 * Compact: breadcrumb + title + launch grid (no conceptual cards).
 */
export default function ProgramsLocationsPublicationWorkspace() {
    const router = useRouter();

    useEffect(() => {
        for (const tile of buildProgramsLocationsLandingTiles()) {
            void prepareConfigurationSoftNavTarget(tile.href, (href) => router.prefetch(href));
        }
    }, [router]);

    return (
        <CompactGroupedLandingShell
            title="Programs & Locations"
            titleIcon={<LibraryBig className="h-5 w-5" strokeWidth={2} />}
            testIdPrefix="programs-locations"
        >
            <ProgramsLocationsLanding />
        </CompactGroupedLandingShell>
    );
}
