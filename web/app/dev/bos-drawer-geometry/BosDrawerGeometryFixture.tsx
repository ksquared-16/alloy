"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import Drawer, { ADMINV2_DRAWER_BACKDROP_Z, ADMINV2_DRAWER_PANEL_Z } from "@/components/admin/Drawer";
import { ADMINV2_COMMAND_SURFACE_Z } from "@/components/admin/Drawer";
import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";
import { measureBosRailOverlayAnchorStyle } from "@/lib/bos/bosRailOverlayAnchor";
import { measureAndApplyDrawerWorkspaceGeometry } from "@/lib/bos/drawerWorkspaceGeometry";
import { collectBosDrawerGeometryReport, registerBosDrawerGeometryDiagnostics } from "@/lib/bos/bosDrawerGeometryReport";
import "@/app/adminV2/adminV2.css";
import "@/app/adminV2/components/workspace/workspace.css";

/**
 * Dev fixture — workspace rail + BOS overlay + modal drawer at 1600×1000.
 * Runs the same drawer geometry var writer as production (`measureAndApplyDrawerWorkspaceGeometry`).
 */
export default function BosDrawerGeometryFixture() {
    const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
    const [overlayStyle, setOverlayStyle] = useState<Record<string, string | number>>({ visibility: "hidden" });

    useEffect(() => {
        document.documentElement.setAttribute("data-bos-right-rail-copilot", "true");
        document.documentElement.setAttribute("data-adminv2-bos-rail-overlay-drawer", "true");
        registerBosDrawerGeometryDiagnostics();

        return () => {
            document.documentElement.removeAttribute("data-bos-right-rail-copilot");
            document.documentElement.removeAttribute("data-adminv2-bos-rail-overlay-drawer");
        };
    }, []);

    useEffect(() => {
        if (!hostEl) return;

        const measure = () => {
            const rect = hostEl.getBoundingClientRect();
            const gutter = BOS_RAIL_OVERLAY_GUTTER_PX;
            const offset = computeBosDrawerRailOffsetPx(rect, gutter);
            const width = Math.max(0, Math.round(rect.width));

            document.documentElement.style.setProperty(BOS_DRAWER_RAIL_OFFSET_CSS_VAR, `${offset}px`);
            document.documentElement.style.setProperty(BOS_OVERLAY_WIDTH_CSS_VAR, `${width}px`);
            document.documentElement.style.setProperty(BOS_OVERLAY_GUTTER_CSS_VAR, `${gutter}px`);
            measureAndApplyDrawerWorkspaceGeometry();
            setOverlayStyle({
                ...measureBosRailOverlayAnchorStyle(hostEl),
                zIndex: ADMINV2_COMMAND_SURFACE_Z,
            });
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(hostEl);
        window.addEventListener("resize", measure);
        const t = window.setTimeout(() => {
            measure();
            collectBosDrawerGeometryReport({ log: true, highlight: true });
        }, 300);

        return () => {
            window.clearTimeout(t);
            ro.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [hostEl]);

    return (
        <div
            className="min-h-screen bg-[#f4f6f9]"
            data-dev-bos-drawer-geometry-fixture="true"
            data-adminv2-app-shell="workspace-v2"
            data-adminv2-sidebar-collapsed="false"
        >
            <aside
                data-adminv2-sidebar="true"
                className="adminv2-sidebar-shell fixed left-0 top-0 bottom-0 z-[100] w-[280px] border-r border-alloy-stone/20 bg-[#273f52]"
                aria-hidden
            />
            <div className="min-h-screen p-4 pl-[296px]">
            <p className="mb-3 text-xs text-alloy-midnight/70">
                Dev geometry fixture — uses production var writer; report runs automatically; or call{" "}
                <code className="font-mono">__alloyReportBosDrawerGeometry()</code>
            </p>
            <div
                data-ws-surface="work_unit"
                className="adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2 mx-auto max-w-[1520px]"
                data-adminv2-workspace-root-shell="true"
            >
                <div className="adminv2-ws-dept-v2-contain">
                    <nav
                        className="adminv2-ws-inline-breadcrumb text-alloy-midnight/60 flex flex-wrap items-center gap-0.5 px-1"
                        aria-label="Breadcrumb"
                    >
                        <span className="text-alloy-midnight/75 font-medium">Workspace</span>
                        <span className="text-alloy-midnight/35" aria-hidden>/</span>
                        <span className="text-alloy-midnight/75 font-medium">Lead Management</span>
                        <span className="text-alloy-midnight/35" aria-hidden>/</span>
                        <span className="text-alloy-midnight/90 font-medium">New Leads</span>
                    </nav>
                    <div className="adminv2-ws-dept-v2-page-split mt-1">
                        <div className="adminv2-ws-dept-v2-primary-column">
                            <div className="adminv2-ws-dept-v2-control-deck">
                                <div className="adminv2-ws-dept-v2-top-stack">
                                    <div className="adminv2-ws-dept-v2-brief">
                                        <div className="adminv2-ws-dept-v2-brief-headline">New Leads</div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-alloy-stone/15 bg-white p-4 text-sm text-alloy-midnight/70">
                                Queue preview column (fixture)
                            </div>
                        </div>
                        <div
                            className="adminv2-ws-dept-v2-command-column adminv2-ws-shell-command-column"
                            data-adminv2-workspace-command-column
                        >
                            <div
                                className="adminv2-ws-dept-v2-rail adminv2-ws-command-rail-with-bos adminv2-ws-dept-v2-rail--command-shell"
                                data-adminv2-workspace-command-rail
                            >
                                <div className="adminv2-ws-command-rail-actions-section adminv2-ws-command-rail-actions-section--expanded">
                                    <div className="adminv2-ws-command-rail-actions-trigger">Actions (3) ▼</div>
                                    <div className="adminv2-ws-command-rail-actions-body text-xs text-[#273f52]">
                                        Action preview
                                    </div>
                                </div>
                                <div
                                    ref={setHostEl}
                                    className="adminv2-ws-command-rail-bos-host flex min-h-0 flex-1 flex-col"
                                    data-adminv2-command-rail-bos-host
                                >
                                    <div
                                        className="flex flex-1 flex-col rounded-lg border border-alloy-stone/15 bg-white p-3 text-xs text-[#273f52]"
                                        data-adminv2-command-surface-layer="rail"
                                    >
                                        BOS host anchor (fixture)
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {hostEl && overlayStyle.visibility !== "hidden" ?
                createPortal(
                    <div
                        data-adminv2-bos-rail-overlay="true"
                        className="adminv2-bos-rail-overlay pointer-events-auto flex min-h-0 flex-col"
                        style={overlayStyle}
                    >
                        <div
                            className="flex flex-1 flex-col bg-white p-3 text-xs text-[#273f52]"
                            data-adminv2-command-surface-layer="rail"
                        >
                            BOS overlay panel (fixture)
                        </div>
                    </div>,
                    document.body
                )
            :   null}

            <Drawer
                isOpen
                onClose={() => undefined}
                title="Sample Lead"
                variant="adminV2"
                presentation="modal"
                recordModalTone="cleaning-v2"
                zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
                zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            >
                <div
                    className="adminv2-drawer-vm-cold-loading"
                    data-drawer-vm-runtime-cold-loading="true"
                >
                    <p className="text-sm font-medium text-alloy-midnight/75">Loading opportunity…</p>
                </div>
            </Drawer>
            </div>
        </div>
    );
}
