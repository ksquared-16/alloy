export type OipHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export function normalizeOipHealthStatus(raw: string | undefined | null): OipHealthStatus {
    if (raw === "healthy" || raw === "warning" || raw === "critical") return raw;
    return "unknown";
}

export function oipHealthStatusLabel(status: OipHealthStatus): string {
    switch (status) {
        case "healthy":
            return "Healthy";
        case "warning":
            return "Warning";
        case "critical":
            return "Critical";
        default:
            return "No data";
    }
}

export function oipHealthStatusChipClass(status: OipHealthStatus): string {
    switch (status) {
        case "healthy":
            return "border-alloy-juniper/30 bg-alloy-juniper/10 text-alloy-juniper";
        case "warning":
            return "border-alloy-amber/35 bg-alloy-amber/10 text-alloy-amber";
        case "critical":
            return "border-alloy-ember/35 bg-alloy-ember/10 text-alloy-ember";
        default:
            return "border-alloy-stone/20 bg-alloy-stone/5 text-alloy-midnight/45";
    }
}

export function isOffTrackStatus(status: OipHealthStatus): boolean {
    return status === "warning" || status === "critical";
}
