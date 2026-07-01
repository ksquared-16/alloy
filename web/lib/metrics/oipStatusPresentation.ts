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
            return "border-alloy-juniper/50 bg-alloy-juniper/12 text-alloy-juniper";
        case "warning":
            return "border-alloy-ember/70 bg-alloy-ember text-white";
        case "critical":
            return "border-red-600/80 bg-red-600 text-white";
        default:
            return "border-alloy-stone/30 bg-alloy-stone/10 text-alloy-midnight/55";
    }
}

export function isOffTrackStatus(status: OipHealthStatus): boolean {
    return status === "warning" || status === "critical";
}
