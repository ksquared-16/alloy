/**
 * OIP visual tokens — delegates to Experience Builder widget tone palette.
 *
 * Brand note (Tailwind @theme): Bend Pine teal = `alloy-juniper` (#00A283).
 * `alloy-pine` in CSS is a legacy midnight-adjacent token — do not use for enrollment green.
 */

import type { LayoutEditorWidgetRuntimeTone } from "@/lib/layout/layoutEditorWidgetStyle";
import {
    resolveLayoutEditorWidgetToneIconClass,
    resolveLayoutEditorWidgetToneRailClass,
    resolveLayoutEditorWidgetToneTitleClass,
} from "@/lib/layout/layoutEditorWidgetStyle";
import type { OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";

/** Domain keys aligned to metric packs / business processes. */
export type OipKpiAccentKey =
    | "enrollment"
    | "communications"
    | "forms"
    | "operational"
    | "attendance"
    | "capacity"
    | "billing"
    | "staffing"
    | "neutral";

export type OipKpiCardLayout = "command" | "compact" | "preview" | "health";

/** Experience Builder tone per OIP domain — single source of truth. */
export const OIP_DOMAIN_EB_TONE: Record<OipKpiAccentKey, LayoutEditorWidgetRuntimeTone> = {
    enrollment: "green",
    communications: "blue",
    forms: "purple",
    operational: "neutral",
    attendance: "amber",
    capacity: "blue",
    billing: "purple",
    staffing: "amber",
    neutral: "neutral",
};

export type OipDomainVisualTokens = {
    ebTone: LayoutEditorWidgetRuntimeTone;
    iconWell: string;
    leftRail: string;
    title: string;
    topBar: string;
    sectionLabel: string;
};

export function oipDomainVisualTokens(accent: OipKpiAccentKey): OipDomainVisualTokens {
    const ebTone = OIP_DOMAIN_EB_TONE[accent] ?? "neutral";
    const iconWell = resolveLayoutEditorWidgetToneIconClass(ebTone);
    const leftRail = resolveLayoutEditorWidgetToneRailClass(ebTone);
    const title = resolveLayoutEditorWidgetToneTitleClass(ebTone);

    const topBar =
        accent === "enrollment" ? "border-t-alloy-juniper/75"
        : accent === "communications" ? "border-t-alloy-blue/75"
        : accent === "forms" ? "border-t-violet-500/70"
        : accent === "operational" ? "border-t-alloy-midnight/40"
        : "border-t-alloy-stone/25";

    const sectionLabel =
        accent === "enrollment" ? "text-alloy-juniper/85"
        : accent === "communications" ? "text-alloy-blue/85"
        : accent === "forms" ? "text-violet-600/85"
        : accent === "operational" ? "text-alloy-midnight/75"
        : "text-alloy-midnight/55";

    return { ebTone, iconWell, leftRail, title, topBar, sectionLabel };
}

/** @deprecated use oipDomainVisualTokens */
export const OIP_KPI_ACCENT: Record<
    OipKpiAccentKey,
    { leftBar: string; iconWell: string; topBar: string; label: string }
> = Object.fromEntries(
    (Object.keys(OIP_DOMAIN_EB_TONE) as OipKpiAccentKey[]).map((key) => {
        const t = oipDomainVisualTokens(key);
        return [key, { leftBar: t.leftRail, iconWell: t.iconWell, topBar: t.topBar, label: t.sectionLabel }];
    })
) as Record<OipKpiAccentKey, { leftBar: string; iconWell: string; topBar: string; label: string }>;

const METRIC_ACCENT: Record<string, OipKpiAccentKey> = {
    "enrollment.tour_conversion_rate": "enrollment",
    "enrollment.time_to_schedule_tour": "enrollment",
    "forms.completion_rate": "forms",
    "forms.packet_completion_time": "forms",
    "ops.work_overdue_count": "operational",
    "ops.needs_attention_count": "operational",
    "ops.workflow_failure_rate": "operational",
    "ops.readiness_gap_count": "operational",
    "comms.delivery_rate": "communications",
    "comms.reply_rate": "communications",
    "comms.failed_delivery_count": "communications",
};

const STRIP_ACCENT: Record<string, OipKpiAccentKey> = {
    "oip.enrollment.tour_conversion_rate": "enrollment",
    "oip.enrollment.time_to_schedule_tour": "enrollment",
    "oip.forms.completion_rate": "forms",
    "oip.ops.work_overdue_count": "operational",
    "oip.ops.needs_attention_count": "operational",
};

const PACK_ACCENT: Record<string, OipKpiAccentKey> = {
    operational_health: "operational",
    enrollment: "enrollment",
    communications: "communications",
    forms: "forms",
    capacity: "capacity",
    attendance: "attendance",
    staffing: "staffing",
    billing: "billing",
};

const PROCESS_ACCENT: Record<string, OipKpiAccentKey> = {
    lead_management: "enrollment",
    enrollment: "enrollment",
    enrollment_pipeline: "enrollment",
    communications: "communications",
    forms: "forms",
    operational_health: "operational",
};

function normalizeKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
}

export function oipMetricAccentKey(metricKey: string | null | undefined): OipKpiAccentKey {
    const key = String(metricKey ?? "").trim();
    if (!key) return "neutral";
    return METRIC_ACCENT[key] ?? STRIP_ACCENT[key] ?? "neutral";
}

export function oipPackAccentKey(packKey: string | null | undefined): OipKpiAccentKey {
    const key = String(packKey ?? "").trim();
    return PACK_ACCENT[key] ?? "neutral";
}

export function oipProcessAccentKey(processKey: string | null | undefined, label?: string | null): OipKpiAccentKey {
    const normalized = normalizeKey(processKey);
    if (normalized && PROCESS_ACCENT[normalized]) return PROCESS_ACCENT[normalized]!;
    const labelNorm = String(label ?? "").toLowerCase();
    if (labelNorm.includes("enrollment") || labelNorm.includes("lead")) return "enrollment";
    if (labelNorm.includes("communication")) return "communications";
    if (labelNorm.includes("form")) return "forms";
    if (labelNorm.includes("operational")) return "operational";
    if (labelNorm.includes("attendance")) return "attendance";
    if (labelNorm.includes("capacity")) return "capacity";
    if (labelNorm.includes("billing")) return "billing";
    if (labelNorm.includes("staff")) return "staffing";
    return "enrollment";
}

export function oipHealthAccentKey(label: string): OipKpiAccentKey {
    const normalized = label.toLowerCase();
    if (normalized.includes("enrollment")) return "enrollment";
    if (normalized.includes("operational") || normalized.includes("business")) return "operational";
    return "neutral";
}

export function oipSummaryGroupAccentKey(label: string): OipKpiAccentKey {
    const normalized = label.toLowerCase();
    if (normalized.includes("enrollment")) return "enrollment";
    if (normalized.includes("operation")) return "operational";
    if (normalized.includes("communication")) return "communications";
    if (normalized.includes("form")) return "forms";
    return "neutral";
}

export function oipKpiStatusBorderClass(status: OipHealthStatus | string | undefined | null): string {
    switch (normalizeOipHealthStatus(status)) {
        case "healthy":
            return "border-alloy-juniper/50";
        case "warning":
            return "border-alloy-ember/55";
        case "critical":
            return "border-alloy-ember/65";
        default:
            return "border-alloy-midnight/14";
    }
}

export function oipKpiStatusLeftBarClass(status: OipHealthStatus | string | undefined | null): string {
    switch (normalizeOipHealthStatus(status)) {
        case "healthy":
            return "border-l-alloy-juniper/75";
        case "warning":
            return "border-l-alloy-ember/75";
        case "critical":
            return "border-l-alloy-ember";
        default:
            return "border-l-alloy-midnight/20";
    }
}

export function oipKpiCardShellClass(args: {
    status?: OipHealthStatus | string | null;
    accent?: OipKpiAccentKey;
    layout?: OipKpiCardLayout;
    interactive?: boolean;
}): string {
    const layout = args.layout ?? "compact";
    const status = normalizeOipHealthStatus(args.status);
    const accent = args.accent ?? "neutral";
    const domain = oipDomainVisualTokens(accent);
    const statusBorder = oipKpiStatusBorderClass(status);

    const base = "rounded-md border bg-white border-l-[3px] transition-colors";

    const size =
        layout === "command"
            ? "w-[8.75rem] shrink-0 px-2 py-1.5"
            : layout === "health"
              ? "w-[8.25rem] shrink-0 px-2 py-1.5"
              : layout === "preview"
                ? "min-w-0 px-0 py-0 border-0 border-l-0 bg-transparent shadow-none"
                : "min-w-[5.5rem] max-w-[8.5rem] flex-1 px-2 py-1.5";

    const leftBar = status === "unknown" ? domain.leftRail : oipKpiStatusLeftBarClass(status);

    const interactive =
        args.interactive
            ? "cursor-pointer hover:border-alloy-juniper/45 hover:shadow-[0_1px_4px_rgba(0,162,131,0.12)]"
            : "";

    if (layout === "preview") {
        return "min-w-0";
    }

    return [base, size, leftBar, statusBorder, interactive].filter(Boolean).join(" ");
}

/** Flat workspace command band — no outer card box. */
export function oipWorkspaceCommandBandClass(): string {
    return "w-full";
}

/** Flat work-unit command band — no nested shell box. */
export function oipWorkUnitCommandBandClass(): string {
    return "w-full pb-2";
}

/** Centered, dense KPI row — cards stay visually grouped. */
export function oipKpiCommandRowClass(_layout: "command" | "compact" | "health" = "command"): string {
    return "flex flex-wrap items-stretch justify-center gap-1.5";
}

/** O.I. modal section — color identity without heavy boxing. */
export function oipModalSectionClass(accent: OipKpiAccentKey): string {
    const domain = oipDomainVisualTokens(accent);
    return `border-l-[3px] pl-2.5 ${domain.leftRail}`;
}

/** @deprecated removed boxed command surface */
export function oipKpiCommandSurfaceClass(): string {
    return oipWorkspaceCommandBandClass();
}
