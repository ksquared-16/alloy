"use client";

import type { HTMLAttributes, ReactNode } from "react";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { OipKpiObjectCard, OipKpiObjectRow } from "@/components/admin/workspace/OipKpiObjectCard";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import {
    formatTargetFromKpi,
    oipHealthPremiumChipClass,
    oipStatusOperatorLabel,
} from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { oipDomainVisualTokens, oipPackAccentKey } from "@/lib/metrics/oipKpiCardVisualSystem";

/** Shared Alloy styling for Operational Intelligence — white surfaces, Experience Builder tones. */
export const OIP_CARD_CLASS =
    "rounded-lg border border-alloy-midnight/12 bg-white p-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.04)]";
export const OIP_SECTION_TITLE_CLASS = "text-[11px] font-semibold tracking-wide text-alloy-midnight/85";
export const OIP_SECTION_HELPER_CLASS = "mt-0.5 text-[10px] leading-snug text-alloy-midnight/50";
export const OIP_PRIMARY_BTN_CLASS =
    "rounded-lg bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-juniper/90 disabled:opacity-50";
export const OIP_SECONDARY_BTN_CLASS =
    "rounded-lg border border-alloy-midnight/15 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/30 disabled:opacity-50";
export const OIP_LINK_CLASS = "text-[11px] font-medium text-alloy-juniper hover:underline";
export const OIP_INLINE_ACTION_CLASS =
    "text-[11px] font-semibold text-alloy-juniper hover:text-alloy-juniper/80 hover:underline";

/** Pack accent rails — Experience Builder tone rails. */
export function oipPackAccent(packKey: string) {
    const accent = oipPackAccentKey(packKey);
    const domain = oipDomainVisualTokens(accent);
    return { border: domain.leftRail, label: domain.sectionLabel };
}

export function OipSectionCard({
    title,
    helper,
    children,
    className,
    ...rest
}: {
    title: string;
    helper?: string;
    children: ReactNode;
    className?: string;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div {...rest} className={`${OIP_CARD_CLASS} ${className ?? ""}`}>
            <div className="mb-2 border-b border-alloy-midnight/10 pb-1.5">
                <div className={OIP_SECTION_TITLE_CLASS}>{title}</div>
                {helper ? <p className={OIP_SECTION_HELPER_CLASS}>{helper}</p> : null}
            </div>
            {children}
        </div>
    );
}

/** @deprecated Use OipKpiObjectCard */
export function OipSummaryCell({
    label,
    value,
    status,
    loading,
    target,
}: {
    label: string;
    value: string;
    status?: string;
    loading?: boolean;
    target?: string | null;
}) {
    return <OipKpiObjectCard label={label} value={value} target={target} status={status} loading={loading} compact />;
}

export function OipSummaryObjectRow({
    metricKeys,
    resolved,
    loading,
}: {
    metricKeys: readonly OipMetricKey[];
    resolved: ResolvedMetricMap;
    loading?: boolean;
}) {
    return (
        <OipKpiObjectRow>
            {metricKeys.map((key) => {
                const metric = resolved[key];
                return (
                    <OipKpiObjectCard
                        key={key}
                        label={oipSummaryLabel(key)}
                        value={metric?.formatted_value ?? "—"}
                        target={formatTargetFromKpi(metric?.kpi)}
                        status={metric?.kpi?.status}
                        loading={loading}
                        compact
                        metricKey={key}
                    />
                );
            })}
        </OipKpiObjectRow>
    );
}

export function OipHealthPremiumChip({ label, status, className = "" }: { label: string; status: string; className?: string }) {
    const normalized = normalizeOipHealthStatus(status);
    return (
        <div className={`rounded-md border px-2.5 py-1.5 ${oipHealthPremiumChipClass(normalized)} ${className}`}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-75">{label}</div>
            <div className="mt-0.5 text-xs font-semibold">{oipStatusOperatorLabel(normalized)}</div>
        </div>
    );
}
