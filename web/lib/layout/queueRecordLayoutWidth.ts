import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";

export const QUEUE_RECORD_WIDTH_OPTIONS: { value: QueueRecordColumnWidth; label: string }[] = [
    { value: "identity", label: "Identity" },
    { value: "children", label: "Children" },
    { value: "status_band", label: "Status" },
    { value: "next_step", label: "Next step" },
    { value: "date_event", label: "Date / event" },
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "flex", label: "Flexible" },
];

export function queueRecordWidthToCss(width: QueueRecordColumnWidth | string | undefined): string {
    switch (width) {
        case "identity":
            return "minmax(240px, 1.15fr)";
        case "children":
            return "minmax(260px, 1.25fr)";
        case "status_band":
            return "minmax(160px, 0.7fr)";
        case "next_step":
            return "minmax(220px, 1fr)";
        case "date_event":
            return "minmax(140px, 0.55fr)";
        case "small":
            return "minmax(120px, 0.5fr)";
        case "medium":
            return "minmax(180px, 0.85fr)";
        case "large":
            return "minmax(280px, 1.35fr)";
        case "flex":
            return "minmax(200px, 1fr)";
        default:
            if (typeof width === "string" && width.includes("minmax")) return width;
            return "minmax(7rem, 1fr)";
    }
}

export function inferQueueRecordWidthToken(cssWidth: string | undefined): QueueRecordColumnWidth {
    if (!cssWidth) return "medium";
    if (cssWidth.includes("0.75fr")) return "small";
    if (cssWidth.includes("1.35fr")) return "large";
    if (cssWidth.includes("1.25fr")) return "flex";
    if (cssWidth.includes("auto")) return "small";
    return "medium";
}
