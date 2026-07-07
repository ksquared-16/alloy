/**
 * Workspace Header Surface config (pure).
 *
 * Title, subtitle, and 3–5 org-level KPI slots for `/workspace`. KPI values resolve from
 * existing Operational Calculations — same keys/source as Work Unit header cards.
 *
 * Persistence: `entity_layouts` (surface="workspace", entityType="workspace",
 * layoutKey="workspace_header") with config in `doc.metadata.workspaceHeaderSurface`.
 */

import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import {
    normalizeProcessCardAccent,
} from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    PROCESS_CARD_ACCENTS,
    PROCESS_CARD_ICONS,
    normalizeProcessCardIcon,
    type ProcessCardAccent,
    type ProcessCardIcon,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { WORKSPACE_HEADER_NO_DATA_VALUE, WORKSPACE_HEADER_UNKNOWN_STATUS } from "./workspaceHeaderCards";
import { drillHrefForMetricKey } from "./types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";

export const WORKSPACE_HEADER_LAYOUT_KEY = "workspace_header";
export const WORKSPACE_HEADER_KPI_SLOT_COUNT = 5;
export const WORKSPACE_HEADER_KPI_REQUIRED_COUNT = 3;

export type WorkspaceHeaderKpiSlot = {
    slot: 1 | 2 | 3 | 4 | 5;
    /** Slots 1–3 default on; 4–5 are optional. */
    enabled: boolean;
    label: string | null;
    icon: ProcessCardIcon;
    /** Operational Calculation key (OipMetricKey). */
    sourceKey: string | null;
    accent: ProcessCardAccent | null;
};

export type WorkspaceHeaderSurfaceConfig = {
    version: 1;
    title: string | null;
    subtitle: string | null;
    /** Work Unit header identity glyph — optional; absent → no chip beside title. */
    icon?: ProcessCardIcon | null;
    /** Work Unit header identity accent — tints the identity chip. */
    accent?: ProcessCardAccent | null;
    kpis: WorkspaceHeaderKpiSlot[];
};

/** Default org-level KPI set when no surface is published. */
export const DEFAULT_WORKSPACE_HEADER_KPIS: readonly WorkspaceHeaderKpiSlot[] = [
    {
        slot: 1,
        enabled: true,
        label: "Needs attention",
        icon: "users",
        sourceKey: "ops.needs_attention_count",
        accent: null,
    },
    {
        slot: 2,
        enabled: true,
        label: "Overdue work",
        icon: "clipboard",
        sourceKey: "ops.work_overdue_count",
        accent: "gold",
    },
    {
        slot: 3,
        enabled: true,
        label: "Active children",
        icon: "chart",
        sourceKey: "enrollment.active_leads",
        accent: null,
    },
    { slot: 4, enabled: false, label: null, icon: "grid", sourceKey: null, accent: null },
    { slot: 5, enabled: false, label: null, icon: "grid", sourceKey: null, accent: null },
];

export const DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG: WorkspaceHeaderSurfaceConfig = {
    version: 1,
    title: null,
    subtitle: null,
    kpis: DEFAULT_WORKSPACE_HEADER_KPIS.map((k) => ({ ...k })),
};

function isProcessCardIcon(v: unknown): v is ProcessCardIcon {
    return typeof v === "string" && (PROCESS_CARD_ICONS as readonly string[]).includes(v);
}

function isProcessCardAccent(v: unknown): v is ProcessCardAccent {
    return typeof v === "string" && (PROCESS_CARD_ACCENTS as readonly string[]).includes(v);
}

function normalizeSlot(raw: unknown, slot: 1 | 2 | 3 | 4 | 5, fallback: WorkspaceHeaderKpiSlot): WorkspaceHeaderKpiSlot {
    if (!raw || typeof raw !== "object") return { ...fallback, slot };
    const r = raw as Record<string, unknown>;
    const enabledDefault = slot <= WORKSPACE_HEADER_KPI_REQUIRED_COUNT;
    return {
        slot,
        enabled: typeof r.enabled === "boolean" ? r.enabled : enabledDefault,
        label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : null,
        icon: isProcessCardIcon(r.icon) ? r.icon : fallback.icon,
        sourceKey: typeof r.sourceKey === "string" && r.sourceKey.trim() ? r.sourceKey.trim() : null,
        accent: isProcessCardAccent(r.accent) ? r.accent : null,
    };
}

export function normalizeWorkspaceHeaderSurfaceConfig(raw: unknown): WorkspaceHeaderSurfaceConfig {
    if (!raw || typeof raw !== "object") {
        return {
            version: 1,
            title: null,
            subtitle: null,
            kpis: DEFAULT_WORKSPACE_HEADER_KPIS.map((k) => ({ ...k })),
        };
    }
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : null;
    const subtitle = typeof r.subtitle === "string" && r.subtitle.trim() ? r.subtitle.trim() : null;
    const icon = normalizeProcessCardIcon(r.icon) ?? null;
    const accent = normalizeProcessCardAccent(r.accent) ?? null;
    const incoming = Array.isArray(r.kpis) ? r.kpis : [];
    const kpis = DEFAULT_WORKSPACE_HEADER_KPIS.map((fallback, index) => {
        const slot = (index + 1) as 1 | 2 | 3 | 4 | 5;
        return normalizeSlot(incoming[index] ?? incoming.find((k) => (k as { slot?: number })?.slot === slot), slot, fallback);
    });
    // Slots 1–3 stay enabled once a source or label is present so required row never collapses entirely.
    for (const kpi of kpis) {
        if (kpi.slot <= WORKSPACE_HEADER_KPI_REQUIRED_COUNT) {
            kpi.enabled = true;
        }
    }
    return { version: 1, title, subtitle, icon, accent, kpis };
}

/** Enabled KPI slots in display order (max 5). */
export function enabledWorkspaceHeaderKpis(
    config: WorkspaceHeaderSurfaceConfig,
): WorkspaceHeaderKpiSlot[] {
    return config.kpis.filter((k) => k.enabled && (k.sourceKey || k.label));
}

export type WorkspaceHeaderKpiVm = {
    slot: number;
    label: string;
    icon: ProcessCardIcon;
    accent: ProcessCardAccent | null;
    formattedValue: string;
    status: string;
    sourceKey: string | null;
    drillHref: string | null;
};

export type WorkspaceHeaderPresentationModel = {
    title: string;
    subtitle: string | null;
    identityIcon: ProcessCardIcon | null;
    identityAccent: ProcessCardAccent | null;
    kpis: WorkspaceHeaderKpiVm[];
};

function normalizeValue(value: string | null | undefined): string {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed && trimmed !== "-" ? trimmed : WORKSPACE_HEADER_NO_DATA_VALUE;
}

function normalizeStatus(status: string | null | undefined): string {
    const trimmed = typeof status === "string" ? status.trim() : "";
    return trimmed || WORKSPACE_HEADER_UNKNOWN_STATUS;
}

/** Resolve presentation labels/values for enabled KPIs from config + metric map. Pure — builder + runtime. */
export function buildWorkspaceHeaderPresentation(
    config: WorkspaceHeaderSurfaceConfig,
    args: {
        fallbackTitle: string | null;
        resolved?: ResolvedMetricMap | null;
    },
): WorkspaceHeaderPresentationModel {
    const title = config.title?.trim() || args.fallbackTitle?.trim() || "Workspace";
    const subtitle = config.subtitle?.trim() || null;
    const identityIcon = config.icon ?? null;
    const identityAccent = config.accent ?? null;
    const kpis = enabledWorkspaceHeaderKpis(config).map((slot) => {
        const calc = slot.sourceKey ? findOperationalCalculation(slot.sourceKey) : null;
        const label = slot.label?.trim() || calc?.label || "Metric";
        const item =
            slot.sourceKey && args.resolved
                ? args.resolved[slot.sourceKey as OipMetricKey]
                : undefined;
        return {
            slot: slot.slot,
            label,
            icon: slot.icon,
            accent: slot.accent,
            formattedValue: normalizeValue(item?.formatted_value),
            status: normalizeStatus(item?.kpi?.status),
            sourceKey: slot.sourceKey,
            drillHref: slot.sourceKey ? drillHrefForMetricKey(slot.sourceKey) : null,
        } satisfies WorkspaceHeaderKpiVm;
    });
    return { title, subtitle, identityIcon, identityAccent, kpis };
}

export function workspaceHeaderKpiSourceKeys(config: WorkspaceHeaderSurfaceConfig): OipMetricKey[] {
    const out: OipMetricKey[] = [];
    for (const kpi of enabledWorkspaceHeaderKpis(config)) {
        if (kpi.sourceKey && isKnownOipMetricKey(kpi.sourceKey) && !out.includes(kpi.sourceKey)) {
            out.push(kpi.sourceKey);
        }
    }
    return out;
}
