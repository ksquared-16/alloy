"use client";

import type { ReactNode } from "react";
import type { ConfigurationObjectOverviewRegionKey } from "@/lib/configRuntime/configurationObject/types";
import {
    CONFIGURATION_OBJECT_OVERVIEW_REGION_PURPOSE,
    projectConfigurationObjectOverviewRegions,
} from "@/lib/configRuntime/configurationObject/overview";

/**
 * Read-first Configuration Object Overview composition.
 * Domains provide region content; platform owns order and presence.
 */
export function ConfigurationObjectOverview({
    regions,
    testId = "configuration-object-overview",
}: {
    regions: Partial<Record<ConfigurationObjectOverviewRegionKey, ReactNode>>;
    testId?: string;
}) {
    const present = projectConfigurationObjectOverviewRegions(
        Object.fromEntries(
            (Object.keys(regions) as ConfigurationObjectOverviewRegionKey[]).map((key) => [
                key,
                regions[key] != null,
            ]),
        ),
    );

    return (
        <div className="flex flex-col gap-4 pb-2" data-testid={testId} data-read-first="true">
            {present.map((region) => (
                <section
                    key={region.key}
                    className="process-config-setup-card p-4"
                    data-testid={`${testId}-${region.key}`}
                    aria-label={CONFIGURATION_OBJECT_OVERVIEW_REGION_PURPOSE[region.key]}
                >
                    {regions[region.key]}
                </section>
            ))}
        </div>
    );
}
