"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { oipMetricKeyForStripKey } from "@/lib/kpi/oipBridge";
import type { MetricKey } from "@/lib/kpi/types";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import { oipHealthIconKey, oipMetricIconKey } from "@/lib/metrics/oipKpiIcons";
import {
    oipHealthAccentKey,
    oipKpiCardShellClass,
    oipKpiCommandRowClass,
    oipMetricAccentKey,
    type OipKpiAccentKey,
    type OipKpiCardLayout,
} from "@/lib/metrics/oipKpiCardVisualSystem";
import { OipKpiIcon } from "@/components/admin/workspace/OipKpiIcon";
import {
    formatTargetDisplayLabel,
    formatTargetFromKpi,
    oipHealthPrimaryValue,
    oipKpiObjectStatusTextClass,
    oipKpiObjectValueClass,
    oipMetricDisplayValue,
    oipShouldShowStatusLine,
    oipStatusIcon,
    oipStatusOperatorLabel,
} from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import {
    filterOperationalPulseKpis,
    sortPerformanceKpis,
    OPERATIONAL_PULSE_STRIP_KEYS,
} from "@/lib/kpi/workspaceKpiPresentation";

export const OIP_PERFORMANCE_STRIP_ORDER = OPERATIONAL_PULSE_STRIP_KEYS;
export { sortPerformanceKpis };

export type OipKpiObjectCardProps = {
    label: string;
    value: string;
    target?: string | null;
    status?: string | null;
    loading?: boolean;
    compact?: boolean;
    className?: string;
    showTrendPlaceholder?: boolean;
    variant?: "metric" | "health";
    layout?: OipKpiCardLayout;
    iconKey?: string | null;
    metricKey?: string | null;
    accent?: OipKpiAccentKey;
    onClick?: () => void;
    /** When set, renders as a link-style interactive card */
    ariaLabel?: string;
};

const TREND_PLACEHOLDER = "Trend coming soon";

function resolveAccent(args: {
    variant: "metric" | "health";
    label: string;
    metricKey?: string | null;
    accent?: OipKpiAccentKey;
}): OipKpiAccentKey {
    if (args.accent) return args.accent;
    if (args.variant === "health") return oipHealthAccentKey(args.label);
    return oipMetricAccentKey(args.metricKey);
}

function resolveIconKey(args: {
    iconKey?: string | null;
    metricKey?: string | null;
    variant: "metric" | "health";
    label: string;
}): string {
    if (args.iconKey) return args.iconKey;
    if (args.variant === "health") {
        if (args.label.toLowerCase().includes("business")) return oipHealthIconKey("business");
        if (args.label.toLowerCase().includes("operational")) return oipHealthIconKey("operational");
        return oipHealthIconKey("enrollment");
    }
    return oipMetricIconKey(args.metricKey);
}

export function OipKpiObjectCard({
    label,
    value,
    target,
    status,
    loading = false,
    compact = false,
    className = "",
    showTrendPlaceholder = true,
    variant = "metric",
    layout = "compact",
    iconKey,
    metricKey,
    accent,
    onClick,
    ariaLabel,
}: OipKpiObjectCardProps) {
    const normalized = normalizeOipHealthStatus(status);
    const resolvedLayout: OipKpiCardLayout = variant === "health" ? "health" : layout;
    const resolvedAccent = resolveAccent({ variant, label, metricKey, accent });
    const resolvedIconKey = resolveIconKey({ iconKey, metricKey, variant, label });
    const targetLine = variant === "metric" && resolvedLayout !== "command" ? formatTargetDisplayLabel(target) : null;
    const displayValue =
        variant === "health" ? oipHealthPrimaryValue(status) : oipMetricDisplayValue(value);
    const showStatus = oipShouldShowStatusLine(status, variant);
    const showNoDataHelper = variant === "health" && normalized === "unknown";
    const interactive = Boolean(onClick);
    const preview = resolvedLayout === "preview";

    if (loading) {
        return (
            <div
                className={`rounded-lg border border-alloy-midnight/15 bg-white px-2.5 py-2 ${className}`}
                aria-busy="true"
            >
                <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 animate-pulse rounded-md bg-alloy-midnight/8" />
                    <div className="h-2 w-12 animate-pulse rounded bg-alloy-midnight/8" />
                </div>
                <div className="mt-1.5 h-4 w-10 animate-pulse rounded bg-alloy-midnight/6" />
            </div>
        );
    }

    const shell = oipKpiCardShellClass({
        status,
        accent: resolvedAccent,
        layout: resolvedLayout,
        interactive,
    });

    const body = (
        <>
            <div className={preview ? "flex flex-col gap-1" : "flex items-start gap-1.5"}>
                <OipKpiIcon
                    iconKey={resolvedIconKey}
                    accent={resolvedAccent}
                    withWell
                    wellSize={preview ? "sm" : "md"}
                />
                <div className="min-w-0 flex-1">
                    <div
                        className={`truncate font-semibold uppercase tracking-wide text-alloy-midnight/55 ${preview ? "text-[7px]" : "text-[8px]"}`}
                    >
                        {label}
                    </div>
                    <div
                        className={`mt-0.5 font-semibold tabular-nums leading-tight ${resolvedLayout === "command" || resolvedLayout === "health" ? "text-sm" : preview ? "text-sm" : "text-base"} ${variant === "health" ? oipKpiObjectStatusTextClass(normalized) : oipKpiObjectValueClass(normalized)}`}
                    >
                        {displayValue}
                    </div>
                </div>
            </div>
            {targetLine ?
                <div className="mt-0.5 tabular-nums text-[9px] text-alloy-midnight/45">{targetLine}</div>
            :   null}
            {showStatus ?
                <div
                    className={`mt-0.5 flex items-center gap-1 text-[9px] font-medium ${oipKpiObjectStatusTextClass(normalized)}`}
                >
                    <span aria-hidden>{oipStatusIcon(normalized)}</span>
                    <span>{oipStatusOperatorLabel(normalized)}</span>
                </div>
            :   null}
            {showNoDataHelper ?
                <div className="mt-0.5 text-[9px] text-alloy-midnight/40">No data yet</div>
            :   null}
            {showTrendPlaceholder && variant === "metric" && !preview && resolvedLayout !== "command" ?
                <div
                    className="mt-0.5 truncate text-[8px] text-alloy-midnight/35"
                    data-oip-trend-placeholder="true"
                    aria-hidden
                >
                    {TREND_PLACEHOLDER}
                </div>
            :   null}
            <div className="hidden" data-oip-future-trend aria-hidden />
            <div className="hidden" data-oip-future-benchmark aria-hidden />
            <div className="hidden" data-oip-future-period-compare aria-hidden />
        </>
    );

    if (interactive) {
        return (
            <button
                type="button"
                className={`${shell} text-left ${className}`}
                onClick={onClick}
                aria-label={ariaLabel ?? `${label}: ${displayValue}`}
                data-oip-kpi-object="true"
                data-oip-kpi-variant={variant}
                data-oip-kpi-layout={resolvedLayout}
                data-oip-kpi-interactive="true"
            >
                {body}
            </button>
        );
    }

    return (
        <div
            className={`${shell} ${className}`}
            data-oip-kpi-object="true"
            data-oip-kpi-variant={variant}
            data-oip-kpi-layout={resolvedLayout}
        >
            {body}
        </div>
    );
}

export function OipKpiObjectRow({
    children,
    className = "",
    layout = "compact",
}: {
    children: React.ReactNode;
    className?: string;
    layout?: OipKpiCardLayout | "compact";
}) {
    const command = layout === "command" || layout === "health";
    return (
        <div
            className={
                command
                    ? `${oipKpiCommandRowClass(layout === "health" ? "health" : "command")} ${className}`
                    : `flex flex-wrap gap-1.5 ${className}`
            }
            data-oip-kpi-object-row="true"
            data-oip-kpi-row-layout={layout}
        >
            {children}
        </div>
    );
}

function metricKeyFromKpiId(id: string): string | null {
    if (!id.startsWith("oip.")) return null;
    return oipMetricKeyForStripKey(id as MetricKey);
}

export function OipKpiObjectFromVm({
    kpi,
    oipResolved,
    loading,
    compact,
    layout = "compact",
    onClick,
}: {
    kpi: KPIVm;
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
    compact?: boolean;
    layout?: OipKpiCardLayout;
    onClick?: () => void;
}) {
    const metricKey = metricKeyFromKpiId(kpi.id);
    const resolved = metricKey && oipResolved ? oipResolved[metricKey as keyof ResolvedMetricMap] : undefined;
    const label = metricKey ? oipSummaryLabel(metricKey) : kpi.label;
    const target = kpi.targetDisplay ?? formatTargetFromKpi(resolved?.kpi) ?? null;
    const status = kpi.kpiStatus ?? resolved?.kpi?.status ?? null;

    return (
        <OipKpiObjectCard
            label={label}
            value={kpi.value}
            target={target}
            status={status}
            loading={loading}
            compact={compact}
            layout={layout}
            metricKey={metricKey}
            onClick={onClick}
            showTrendPlaceholder={layout !== "command"}
            ariaLabel={onClick ? `Open ${label}` : undefined}
        />
    );
}

export function OipPerformanceKpiRow({
    kpis,
    oipResolved,
    loading,
    compact,
    layout = "compact",
    onKpiClick,
}: {
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
    compact?: boolean;
    layout?: OipKpiCardLayout;
    onKpiClick?: (kpi: KPIVm) => void;
}) {
    const performance = filterOperationalPulseKpis(kpis);
    if (!performance.length) return null;

    return (
        <OipKpiObjectRow layout={layout}>
            {performance.map((kpi) => (
                <OipKpiObjectFromVm
                    key={kpi.id}
                    kpi={kpi}
                    oipResolved={oipResolved}
                    loading={loading}
                    compact={compact}
                    layout={layout}
                    onClick={onKpiClick ? () => onKpiClick(kpi) : undefined}
                />
            ))}
        </OipKpiObjectRow>
    );
}

export function OipHealthKpiCard({
    label,
    status,
    layout = "compact",
}: {
    label: string;
    status: string;
    layout?: OipKpiCardLayout;
}) {
    return (
        <OipKpiObjectCard
            label={label}
            value={oipHealthPrimaryValue(status)}
            status={status}
            variant="health"
            showTrendPlaceholder={false}
            compact
            layout={layout}
        />
    );
}
