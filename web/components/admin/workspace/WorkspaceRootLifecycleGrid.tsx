"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    adminV2NavigationClickedItemProps,
    runAdminV2NavigationTransition,
    useAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import {
    parseOperatorWorkUnitEntryHref,
    warmOperatorWorkUnitEntryFromHref,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { OipKpiIcon } from "@/components/admin/workspace/OipKpiIcon";
import { oipDomainVisualTokens, oipProcessAccentKey } from "@/lib/metrics/oipKpiCardVisualSystem";
import { oipProcessIconKey } from "@/lib/metrics/oipKpiIcons";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";
import "@/app/adminV2/components/workspace/workspace.css";

type Props = {
    lifecycles: readonly OperatorLifecycleLandingCard[];
    pending?: boolean;
};

function isModifiedNavClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
}

function formatMetricValue(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return value.toLocaleString();
}

function formatStageCount(count: number): string {
    if (!Number.isFinite(count) || count <= 0) return "—";
    return String(Math.floor(count));
}

function performanceLabel(raw: string): string {
    const normalized = raw.toLowerCase();
    if (normalized.includes("tour conversion")) return "Tour Conversion";
    if (normalized.includes("time to schedule") || normalized.includes("time to tour")) return "Time To Tour";
    if (normalized.includes("form") && normalized.includes("completion")) return "Forms Completion";
    if (normalized.includes("needs attention")) return "Needs Attention";
    if (normalized.includes("overdue")) return "Overdue Work";
    return raw;
}

/** Preview lines for nav tile — up to three meaningful signals. */
function selectTilePreviewMetrics(
    metrics: { label: string; value: string }[]
): { label: string; value: string }[] {
    const find = (needle: string) => metrics.find((m) => m.label.toLowerCase().includes(needle));
    const out: { label: string; value: string }[] = [];
    const tour = find("tour conversion");
    const attention = find("needs attention");
    const forms = find("forms completion");
    if (tour) out.push(tour);
    if (attention) out.push(attention);
    if (forms) out.push(forms);
    if (out.length < 3) {
        for (const metric of metrics) {
            if (out.some((m) => m.label === metric.label)) continue;
            out.push(metric);
            if (out.length >= 3) break;
        }
    }
    return out.slice(0, 3);
}

/** Process navigation tile — destination card, not a KPI dashboard. */
export function WorkspaceRootLifecycleGrid({ lifecycles, pending = false }: Props) {
    const router = useRouter();
    useAdminV2NavigationTransition();

    if (pending) {
        return (
            <div className={WS_LAYOUT.processNavGrid} data-ws-business-process-grid aria-busy="true">
                <div className="min-h-[10rem] min-w-[20rem] max-w-[25rem] rounded-xl border border-alloy-midnight/12 bg-white" />
            </div>
        );
    }

    if (!lifecycles.length) {
        return (
            <div
                className="max-w-[22rem] rounded-lg border border-alloy-midnight/12 bg-white px-3 py-3 text-sm text-alloy-midnight/70"
                data-ws-business-process-grid-empty
            >
                No active business processes are configured for your workspace access yet.
            </div>
        );
    }

    return (
        <div
            className={WS_LAYOUT.processNavGrid}
            data-ws-layout={WS_LAYOUT_ATTR.processNavGrid}
            data-ws-business-process-grid
        >
            {lifecycles.map((lifecycle) => {
                const clickedKey = `lifecycle:${lifecycle.id}`;
                const hasAttention =
                    lifecycle.needsAttentionCount != null && lifecycle.needsAttentionCount > 0;
                const accent = oipProcessAccentKey(lifecycle.processKey, lifecycle.label);
                const domain = oipDomainVisualTokens(accent);
                const previewMetrics =
                    lifecycle.performanceMetrics?.map((m) => ({
                        label: performanceLabel(m.label),
                        value: m.value,
                    })) ?? [];
                const inlineMetrics = selectTilePreviewMetrics(previewMetrics);
                const previewShowsAttention = inlineMetrics.some((m) =>
                    m.label.toLowerCase().includes("needs attention")
                );

                return (
                    <Link
                        key={lifecycle.id}
                        href={lifecycle.entryHref}
                        prefetch={shouldDisableAdminV2LinkPrefetch(lifecycle.entryHref) ? false : undefined}
                        className="group block w-full min-w-[20rem] max-w-[25rem] no-underline text-inherit"
                        {...adminV2NavigationClickedItemProps(clickedKey)}
                        onMouseEnter={() =>
                            warmOperatorWorkUnitEntryFromHref(lifecycle.entryHref, null, "business_process_tile_hover")
                        }
                        onFocus={() =>
                            warmOperatorWorkUnitEntryFromHref(lifecycle.entryHref, null, "business_process_tile_focus")
                        }
                        onClick={(e) => {
                            if (isModifiedNavClick(e)) return;
                            e.preventDefault();
                            const href = lifecycle.entryHref;
                            void runAdminV2NavigationTransition({
                                href,
                                clickedKey,
                                variant: "work_unit",
                                commitFirst: true,
                                prepare: () => {
                                    const { workUnitSlug } = parseOperatorWorkUnitEntryHref(href);
                                    if (!workUnitSlug) return;
                                    warmOperatorWorkUnitEntryFromHref(href, null, "business_process_tile_click");
                                },
                                commit: () => router.push(href),
                            });
                        }}
                    >
                        <article
                            className={`${WS_LAYOUT.processNavTile} ${domain.leftRail}`}
                            data-ws-business-process-tile="true"
                        >
                            <div className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
                                <div className="flex items-center gap-3">
                                    <OipKpiIcon
                                        iconKey={oipProcessIconKey(lifecycle.processKey)}
                                        accent={accent}
                                        withWell
                                        wellSize="md"
                                    />
                                    <h3
                                        className={`min-w-0 flex-1 text-base font-semibold leading-snug text-alloy-midnight ${domain.title}`}
                                    >
                                        {lifecycle.label}
                                    </h3>
                                </div>

                                {inlineMetrics.length ?
                                    <ul
                                        className="mt-2.5 space-y-1.5"
                                        data-ws-business-process-performance="true"
                                    >
                                        {inlineMetrics.map((metric) => (
                                            <li
                                                key={metric.label}
                                                className="flex items-baseline justify-between gap-2 text-xs"
                                            >
                                                <span className="font-medium text-alloy-midnight/55">
                                                    {metric.label}
                                                </span>
                                                <span
                                                    className={`shrink-0 font-semibold tabular-nums ${
                                                        metric.label.toLowerCase().includes("needs attention") &&
                                                        metric.value !== "—"
                                                            ? "text-alloy-ember"
                                                            : "text-alloy-midnight"
                                                    }`}
                                                >
                                                    {metric.value}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                :   <p className="mt-2.5 text-[11px] text-alloy-midnight/40">Preview unavailable</p>}

                                <div className="mt-auto flex items-end justify-between gap-3 border-t border-alloy-midnight/8 pt-2.5">
                                    <div className="flex gap-4">
                                        <div>
                                            <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                Records
                                            </div>
                                            <div className="text-[11px] font-semibold tabular-nums text-alloy-midnight/70">
                                                {formatMetricValue(lifecycle.activeRecordCount)}
                                            </div>
                                        </div>
                                        {!previewShowsAttention ?
                                            <div>
                                                <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                    Attention
                                                </div>
                                                <div
                                                    className={`text-[11px] font-semibold tabular-nums ${hasAttention ? "text-alloy-ember" : "text-alloy-midnight/70"}`}
                                                >
                                                    {formatMetricValue(lifecycle.needsAttentionCount)}
                                                </div>
                                            </div>
                                        :   null}
                                        <div>
                                            <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                Stages
                                            </div>
                                            <div className="text-[11px] font-semibold tabular-nums text-alloy-midnight/70">
                                                {formatStageCount(lifecycle.stageCount)}
                                            </div>
                                        </div>
                                    </div>
                                    <span
                                        className="shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-2.5 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper transition-colors group-hover:border-alloy-juniper group-hover:bg-alloy-juniper group-hover:text-white"
                                        data-ws-business-process-open="true"
                                    >
                                        Open →
                                    </span>
                                </div>
                            </div>
                        </article>
                    </Link>
                );
            })}
        </div>
    );
}
