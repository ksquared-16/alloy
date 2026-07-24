"use client";

import { CompactConfigurationLauncher } from "@/components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher";
import { buildFinancialsLandingSections } from "@/lib/financials/financialsLandingModel";

export default function FinancialsLanding() {
    const sections = buildFinancialsLandingSections();

    return (
        <CompactConfigurationLauncher
            testId="financials-landing"
            continuitySurface="financials_landing"
            helper="Choose the financial area you need to configure."
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
