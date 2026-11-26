"use client";

import type { ConfigurationOwnershipSource } from "@/lib/configRuntime/organizationLocationScope";
import { configurationOwnershipLabel } from "@/lib/configRuntime/organizationLocationScope";

export function ConfigOwnershipSourceBadge({
    source,
    locationLabel,
    testId = "config-ownership-source",
}: {
    source: ConfigurationOwnershipSource;
    locationLabel?: string | null;
    testId?: string;
}) {
    const tone =
        source === "location_override" ? "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
        : source === "inherited" || source === "organization_default"
          ? "border-alloy-stone/30 bg-alloy-stone/[0.08] text-alloy-midnight/60"
        : source === "not_assigned" ? "border-alloy-forge/15 bg-alloy-sand/40 text-alloy-midnight/50"
        : "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue";

    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
            data-testid={testId}
            data-ownership-source={source}
        >
            {configurationOwnershipLabel(source, locationLabel)}
        </span>
    );
}
