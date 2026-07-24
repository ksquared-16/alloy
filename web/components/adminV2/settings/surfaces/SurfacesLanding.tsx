"use client";

import { CompactConfigurationLauncher } from "@/components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher";
import { buildSurfacesLandingSections } from "@/lib/configRuntime/surfacesLandingModel";

export default function SurfacesLanding() {
    const sections = buildSurfacesLandingSections();

    return (
        <CompactConfigurationLauncher
            testId="surfaces-landing"
            continuitySurface="surfaces_landing"
            helper="Choose the Surface category you need to configure."
            items={sections.map((section) => ({
                id: section.id,
                label: section.label,
                summary: section.summary,
                href: section.href,
                includes: section.capabilities.slice(0, 3),
            }))}
        />
    );
}
