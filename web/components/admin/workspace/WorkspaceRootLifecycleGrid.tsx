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
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
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

export function WorkspaceRootLifecycleGrid({ lifecycles, pending = false }: Props) {
    const router = useRouter();
    useAdminV2NavigationTransition();

    if (pending) {
        return (
            <div className="grid gap-5 lg:grid-cols-2 xl:max-w-3xl" data-ws-lifecycle-grid aria-busy="true">
                <div className="adminv2-ws-lifecycle-command-card adminv2-ws-lifecycle-command-card--skeleton min-h-[18rem] rounded-[1.35rem]" />
            </div>
        );
    }

    if (!lifecycles.length) {
        return (
            <div
                className="rounded-[1.35rem] border border-alloy-forge/12 bg-white/70 px-5 py-6 text-sm text-alloy-midnight/70"
                data-ws-lifecycle-grid-empty
            >
                No active lifecycles are configured for your workspace access yet.
            </div>
        );
    }

    return (
        <div className="grid gap-5 lg:grid-cols-2 xl:max-w-3xl" data-ws-lifecycle-grid>
            {lifecycles.map((lifecycle) => {
                const clickedKey = `lifecycle:${lifecycle.id}`;

                return (
                    <Link
                        key={lifecycle.id}
                        href={lifecycle.entryHref}
                        prefetch={shouldDisableAdminV2LinkPrefetch(lifecycle.entryHref) ? false : undefined}
                        className="adminv2-ws-lifecycle-command-card-link group block no-underline text-inherit"
                        {...adminV2NavigationClickedItemProps(clickedKey)}
                        onClick={(e) => {
                            if (isModifiedNavClick(e)) return;
                            e.preventDefault();
                            void runAdminV2NavigationTransition({
                                href: lifecycle.entryHref,
                                clickedKey,
                                variant: "work_unit",
                                commit: () => router.push(lifecycle.entryHref),
                            });
                        }}
                    >
                        <article className="adminv2-ws-lifecycle-command-card flex min-h-[18rem] flex-col overflow-hidden rounded-[1.35rem] border border-alloy-forge/12 bg-[linear-gradient(165deg,rgba(255,255,255,0.98)_0%,rgba(244,247,249,0.92)_48%,rgba(232,239,235,0.55)_100%)] shadow-[0_14px_40px_rgba(39,63,82,0.08)] transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-alloy-pine/30 hover:shadow-[0_20px_48px_rgba(39,63,82,0.12)]">
                            <div className="flex flex-1 flex-col px-6 pb-5 pt-6">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-alloy-pine/80">
                                    Lifecycle
                                </div>
                                <h3 className="mt-2 text-[1.65rem] font-semibold leading-snug tracking-tight text-alloy-midnight group-hover:text-alloy-pine">
                                    {lifecycle.label}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed text-alloy-midnight/68">
                                    {lifecycle.description}
                                </p>

                                <div className="adminv2-ws-lifecycle-command-metrics mt-6 grid grid-cols-3 gap-3">
                                    <div className="adminv2-ws-lifecycle-command-metric">
                                        <div className="adminv2-ws-lifecycle-command-metric-label">Records</div>
                                        <div className="adminv2-ws-lifecycle-command-metric-value">
                                            {formatMetricValue(lifecycle.activeRecordCount)}
                                        </div>
                                    </div>
                                    <div className="adminv2-ws-lifecycle-command-metric">
                                        <div className="adminv2-ws-lifecycle-command-metric-label">Attention</div>
                                        <div
                                            className={`adminv2-ws-lifecycle-command-metric-value ${
                                                lifecycle.needsAttentionCount != null &&
                                                lifecycle.needsAttentionCount > 0
                                                    ? "text-alloy-amber"
                                                    : ""
                                            }`}
                                        >
                                            {formatMetricValue(lifecycle.needsAttentionCount)}
                                        </div>
                                    </div>
                                    <div className="adminv2-ws-lifecycle-command-metric">
                                        <div className="adminv2-ws-lifecycle-command-metric-label">Stages</div>
                                        <div className="adminv2-ws-lifecycle-command-metric-value">
                                            {formatStageCount(lifecycle.stageCount)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="adminv2-ws-lifecycle-command-footer flex items-center justify-end border-t border-alloy-forge/10 bg-white/45 px-6 py-4 backdrop-blur-[2px]">
                                <span className="adminv2-ws-lifecycle-command-cta inline-flex shrink-0 items-center justify-center rounded-xl bg-alloy-pine px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,93,74,0.22)] transition-[background-color,transform,box-shadow] group-hover:-translate-y-px group-hover:bg-alloy-pine/92 group-hover:shadow-[0_10px_22px_rgba(47,93,74,0.28)]">
                                    Open →
                                </span>
                            </div>
                        </article>
                    </Link>
                );
            })}
        </div>
    );
}
