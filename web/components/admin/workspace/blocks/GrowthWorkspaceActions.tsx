"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    growthLaneHelperText,
    growthLaneLabel,
    parseGrowthLaneParam,
    type GrowthWorkUnitLaneKey,
} from "@/lib/workspace/growthWorkUnitActionManifest";
import type { WorkspaceGrowthWorkspaceActionsBlock } from "@/lib/workspace/types";

function laneHref(baseDeptUrl: string, lane: GrowthWorkUnitLaneKey | "clear"): string {
    const path = baseDeptUrl.split("?")[0];
    if (lane === "clear") return path;
    return `${path}?lane=${encodeURIComponent(lane)}`;
}

/**
 * Growth department command rail: native “create opportunity”, lane focus links, and admin shortcuts.
 * Row-level qualify / quote / won / lost remain on queue rows — not duplicated as fake shell actions.
 */
function GrowthWorkspaceActionsInner({
    block,
    departmentId,
    workspaceBasePath = "/admin/workspace",
    presentation = "flat",
}: {
    block: WorkspaceGrowthWorkspaceActionsBlock;
    departmentId: string;
    workspaceBasePath?: string;
    presentation?: "flat" | "bridge";
}) {
    const { openDrawer } = useAdminDrawer();
    const searchParams = useSearchParams();
    const lane = parseGrowthLaneParam(searchParams.get("lane"));
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${encodeURIComponent(departmentId)}`;
    const helper = growthLaneHelperText(lane);

    const inner = (
        <>
            <p className={presentation === "bridge" ? "text-[11px] leading-snug opacity-80 mb-2" : "text-xs text-alloy-midnight/65 mb-2"}>
                {helper}
            </p>
            <div
                className={
                    presentation === "bridge"
                        ? "flex flex-wrap gap-1.5 mb-2"
                        : "flex flex-wrap gap-2 mb-3"
                }
            >
                <Link
                    href={laneHref(base, "clear")}
                    className={
                        presentation === "bridge"
                            ? `rounded px-2 py-0.5 text-[10px] font-semibold border no-underline ${
                                  lane == null ? "border-alloy-blue bg-alloy-blue/10 text-alloy-midnight" : "border-alloy-stone/40 text-alloy-midnight/75"
                              }`
                            : `rounded-md px-2 py-1 text-xs font-medium border no-underline ${
                                  lane == null ? "border-alloy-blue bg-alloy-blue/10" : "border-admin-border text-alloy-midnight/80"
                              }`
                    }
                >
                    All lanes
                </Link>
                <Link
                    href={laneHref(base, "new_leads")}
                    className={
                        presentation === "bridge"
                            ? `rounded px-2 py-0.5 text-[10px] font-semibold border no-underline ${
                                  lane === "new_leads" ? "border-alloy-blue bg-alloy-blue/10 text-alloy-midnight" : "border-alloy-stone/40 text-alloy-midnight/75"
                              }`
                            : `rounded-md px-2 py-1 text-xs font-medium border no-underline ${
                                  lane === "new_leads" ? "border-alloy-blue bg-alloy-blue/10" : "border-admin-border text-alloy-midnight/80"
                              }`
                    }
                >
                    Front of funnel
                </Link>
                <Link
                    href={laneHref(base, "unbooked_quotes")}
                    className={
                        presentation === "bridge"
                            ? `rounded px-2 py-0.5 text-[10px] font-semibold border no-underline ${
                                  lane === "unbooked_quotes" ? "border-alloy-blue bg-alloy-blue/10 text-alloy-midnight" : "border-alloy-stone/40 text-alloy-midnight/75"
                              }`
                            : `rounded-md px-2 py-1 text-xs font-medium border no-underline ${
                                  lane === "unbooked_quotes" ? "border-alloy-blue bg-alloy-blue/10" : "border-admin-border text-alloy-midnight/80"
                              }`
                    }
                >
                    Priced · open
                </Link>
            </div>
            <p className={presentation === "bridge" ? "text-[10px] uppercase tracking-wide opacity-60 mb-1" : "text-[11px] font-semibold text-alloy-midnight/55 mb-1"}>
                Surface actions
            </p>
            <div className={presentation === "bridge" ? "space-y-1.5" : "flex flex-wrap gap-2"}>
                <button
                    type="button"
                    onClick={() => openDrawer({ type: "opportunities", id: "new" })}
                    className={
                        presentation === "bridge"
                            ? "adminv2-ws-actions-rail-primary text-center no-underline rounded-md font-bold text-[11px] w-full border-0 cursor-pointer"
                            : "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md hover:opacity-92 adminv2-ws-btn-primary-solid"
                    }
                >
                    Create opportunity
                </button>
                <Link
                    href="/admin/opportunities"
                    className={
                        presentation === "bridge"
                            ? "adminv2-ws-actions-rail-secondary text-center no-underline rounded-md font-bold text-[11px] w-full"
                            : "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-admin-border text-alloy-midnight hover:bg-alloy-stone/30 adminv2-ws-btn-secondary-outline"
                    }
                >
                    All opportunities
                </Link>
                <Link
                    href="/admin/system/work-units"
                    className={
                        presentation === "bridge"
                            ? "adminv2-ws-actions-rail-secondary text-center no-underline rounded-md font-bold text-[11px] w-full"
                            : "inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-admin-border text-alloy-midnight hover:bg-alloy-stone/30 adminv2-ws-btn-secondary-outline"
                    }
                >
                    Work unit settings
                </Link>
            </div>
            <p className={presentation === "bridge" ? "text-[10px] mt-2 opacity-70 leading-snug" : "text-xs text-alloy-midnight/55 mt-3"}>
                Lane: <strong className="text-alloy-midnight/85">{growthLaneLabel(lane)}</strong> — use queue rows for qualify, quote, won, and lost.
            </p>
        </>
    );

    if (presentation === "bridge") {
        return (
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-workspace-block="growth_workspace_actions"
                aria-label={block.title ?? "Growth actions"}
            >
                <h3 className="adminv2-ws-actions-rail-title">{block.title ?? "Actions"}</h3>
                {inner}
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="growth_workspace_actions">
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Growth actions"}</h2>
            <div className="mt-2">{inner}</div>
        </section>
    );
}

export type GrowthWorkspaceActionsProps = Parameters<typeof GrowthWorkspaceActionsInner>[0];

/** Suspense boundary required for `useSearchParams` in Next.js App Router. */
export function GrowthWorkspaceActions(props: GrowthWorkspaceActionsProps) {
    const fb =
        props.presentation === "bridge" ? (
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-2 py-3 text-[11px] opacity-60"
                data-workspace-block="growth_workspace_actions"
            >
                Loading actions…
            </section>
        ) : (
            <div className="rounded-xl border border-admin-border bg-white p-5 text-sm text-alloy-midnight/55">Loading actions…</div>
        );
    return (
        <Suspense fallback={fb}>
            <GrowthWorkspaceActionsInner {...props} />
        </Suspense>
    );
}
