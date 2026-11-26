"use client";

import { LayoutTemplate } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import SurfacesLanding from "@/components/adminV2/settings/surfaces/SurfacesLanding";
import SurfacesConfigurationPage from "@/components/adminV2/settings/surfaces/SurfacesConfigurationPage";
import { CompactGroupedLandingShell } from "@/components/adminV2/settings/configurationRuntime/CompactGroupedLandingShell";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { SurfaceWorkspaceTab } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";
import {
    SURFACES_LANDING_SECTIONS,
    surfacesSectionHref,
} from "@/lib/configRuntime/surfacesLandingModel";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";

/**
 * Organization Surfaces — landing (no section) or category workspace (?section=).
 * Landing matches Financials: compact title + tile grid. Category drill-in is a
 * two-pane Collection → Selected Surface workspace (no category rail).
 */
export default function SurfacesPublicationWorkspace({
    initialSection,
    initialSurfaceId,
    initialTab,
}: {
    initialSection: SurfaceConfigSectionKey | null;
    initialSurfaceId?: string;
    initialTab?: SurfaceWorkspaceTab;
}) {
    const router = useRouter();

    useEffect(() => {
        void prepareConfigurationSoftNavTarget(surfacesSectionHref(null), (href) => router.prefetch(href));
        for (const section of SURFACES_LANDING_SECTIONS) {
            void prepareConfigurationSoftNavTarget(surfacesSectionHref(section), (href) =>
                router.prefetch(href),
            );
        }
    }, [router]);

    if (initialSection) {
        return (
            <SurfacesConfigurationPage
                initialSection={initialSection}
                initialSurfaceId={initialSurfaceId}
                initialTab={initialTab}
                hideCategoryRail
            />
        );
    }

    return (
        <CompactGroupedLandingShell
            title="Surfaces"
            titleIcon={<LayoutTemplate className="h-5 w-5" strokeWidth={2} />}
            testIdPrefix="surfaces"
        >
            <SurfacesLanding />
        </CompactGroupedLandingShell>
    );
}
