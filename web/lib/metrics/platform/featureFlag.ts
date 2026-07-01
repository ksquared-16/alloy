/**
 * Analytics V2 Metric Platform — active development default ON.
 * Set ANALYTICS_V2_METRIC_PLATFORM_ENABLED=0 (server) or
 * NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED=0 (client) to opt out locally.
 */

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

export function isAnalyticsV2MetricPlatformEnabledServer(): boolean {
    return readFlag(process.env.ANALYTICS_V2_METRIC_PLATFORM_ENABLED, true);
}

export function isAnalyticsV2MetricPlatformEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_ANALYTICS_V2_METRIC_PLATFORM_ENABLED, true);
}
