import type { OipKpiAccentKey } from "@/lib/metrics/oipKpiCardVisualSystem";
import { NEEDS_REVIEW_STATUS_LABEL } from "@/lib/communications/v2/commandCenterViewModel";

export type CommsKpiVisualSpec = {
    iconKey: string;
    accent: OipKpiAccentKey;
};

/** Per-metric visual intent for Communications workspace KPI strip. */
const INBOX_KPI_VISUAL: Record<string, CommsKpiVisualSpec> = {
    "Needs reply": { iconKey: "message-square", accent: "enrollment" },
    Overdue: { iconKey: "clock-3", accent: "attendance" },
    Unread: { iconKey: "inbox", accent: "capacity" },
    [NEEDS_REVIEW_STATUS_LABEL]: { iconKey: "clipboard-check", accent: "forms" },
};

const TEMPLATE_KPI_VISUAL: Record<string, CommsKpiVisualSpec> = {
    "Active Templates": { iconKey: "check-circle-2", accent: "enrollment" },
    "Draft Templates": { iconKey: "pencil", accent: "attendance" },
    Categories: { iconKey: "folder", accent: "forms" },
    "Last Updated": { iconKey: "clock-3", accent: "operational" },
};

const ANNOUNCEMENT_KPI_VISUAL: Record<string, CommsKpiVisualSpec> = {
    Draft: { iconKey: "pencil", accent: "attendance" },
    Scheduled: { iconKey: "calendar", accent: "capacity" },
    Active: { iconKey: "send", accent: "enrollment" },
    "Sent Recently": { iconKey: "check-circle-2", accent: "forms" },
};

const DEFAULT_VISUAL: CommsKpiVisualSpec = { iconKey: "message-square", accent: "communications" };

export function commsInboxKpiVisual(label: string): CommsKpiVisualSpec {
    return INBOX_KPI_VISUAL[label] ?? DEFAULT_VISUAL;
}

export function commsTemplateKpiVisual(label: string): CommsKpiVisualSpec {
    return TEMPLATE_KPI_VISUAL[label] ?? DEFAULT_VISUAL;
}

export function commsAnnouncementKpiVisual(label: string): CommsKpiVisualSpec {
    return ANNOUNCEMENT_KPI_VISUAL[label] ?? DEFAULT_VISUAL;
}
