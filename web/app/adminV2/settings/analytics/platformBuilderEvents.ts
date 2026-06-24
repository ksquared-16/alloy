export const ANALYTICS_V2_SNAPSHOTS_UPDATED = "analytics-v2-snapshots-updated";

export function dispatchAnalyticsSnapshotsUpdated(detail?: { written?: number; errors?: string[] }) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ANALYTICS_V2_SNAPSHOTS_UPDATED, { detail }));
}
