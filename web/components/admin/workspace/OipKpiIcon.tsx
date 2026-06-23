"use client";

import { oipDomainVisualTokens, type OipKpiAccentKey } from "@/lib/metrics/oipKpiCardVisualSystem";
import { oipMetricIconKey, resolveOipLucideIcon } from "@/lib/metrics/oipKpiIcons";

type Props = {
    iconKey?: string | null;
    metricKey?: string | null;
    accent?: OipKpiAccentKey;
    className?: string;
    withWell?: boolean;
    wellSize?: "sm" | "md";
};

export function OipKpiIcon({
    iconKey,
    metricKey,
    accent = "neutral",
    className = "h-3 w-3",
    withWell = false,
    wellSize = "md",
}: Props) {
    const key = iconKey ?? oipMetricIconKey(metricKey);
    const Icon = resolveOipLucideIcon(key);
    if (!Icon) return null;

    const domain = oipDomainVisualTokens(accent);
    const sizeClass = wellSize === "sm" ? "h-4 w-4" : "h-5 w-5";
    const iconSize = wellSize === "sm" ? "h-2.5 w-2.5" : className;

    if (withWell) {
        return (
            <span
                className={`inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-md border ${domain.iconWell}`}
                aria-hidden
            >
                <Icon className={iconSize} />
            </span>
        );
    }

    return <Icon className={className} aria-hidden />;
}
