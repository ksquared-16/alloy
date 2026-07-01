"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ActionWorkspaceBosShell } from "@/components/admin/actions/ActionWorkspaceBosShell";
import { ADMINV2_COMMAND_SURFACE_Z } from "@/components/admin/Drawer";
import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";
import { measureBosRailOverlayAnchorStyle } from "@/lib/bos/bosRailOverlayAnchor";
import { measureAndApplyActionWorkspaceGeometry } from "@/lib/admin/actions/actionWorkspaceGeometry";
import "@/app/adminV2/adminV2.css";
import "@/app/adminV2/components/workspace/workspace.css";

/** Mirrors production workspace chrome + open Create Lead drawer for regression capture. */
export default function ActionWorkspaceDrawerRegressionFixture() {
    const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
    const [overlayStyle, setOverlayStyle] = useState<Record<string, string | number>>({ visibility: "hidden" });

    useEffect(() => {
        document.documentElement.setAttribute("data-adminv2-workspace-shell", "v2");
        document.documentElement.setAttribute("data-adminv2-bos-rail-overlay-drawer", "true");
        return () => {
            document.documentElement.removeAttribute("data-adminv2-workspace-shell");
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
            measureAndApplyActionWorkspaceGeometry();
            setOverlayStyle({
                ...measureBosRailOverlayAnchorStyle(hostEl),
                zIndex: ADMINV2_COMMAND_SURFACE_Z,
            });
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(hostEl);
        window.addEventListener("resize", measure);
        const t = window.setTimeout(measure, 300);
        return () => {
            window.clearTimeout(t);
            ro.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [hostEl]);

    return (
        <div
            className="min-h-screen bg-[#f4f6f9]"
            data-dev-action-workspace-drawer-regression="true"
            data-adminv2-app-shell="workspace-v2"
            data-adminv2-sidebar-collapsed="false"
        >
            <aside
                data-adminv2-sidebar="true"
                className="adminv2-sidebar-shell fixed left-0 top-0 bottom-0 z-[100] w-[280px] border-r border-alloy-stone/20 bg-[#273f52]"
                aria-hidden
            />
            <div className="min-h-screen p-4 pl-[296px]">
                <div
                    data-ws-surface="work_unit"
                    className="adminv2-ws-root adminv2-ws-work-unit adminv2-ws-wu-v2 mx-auto max-w-[1520px]"
                    data-adminv2-workspace-root-shell="true"
                >
                    <div className="adminv2-ws-dept-v2-contain">
                        <div className="adminv2-ws-dept-v2-page-split mt-1">
                            <div className="adminv2-ws-dept-v2-primary-column">
                                <div className="mt-3 rounded-lg border border-alloy-stone/15 bg-white p-4 text-sm text-alloy-midnight/70">
                                    Queue preview (fixture)
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
                                    <div
                                        ref={setHostEl}
                                        className="adminv2-ws-command-rail-bos-host flex min-h-0 flex-1 flex-col"
                                        data-adminv2-command-rail-bos-host
                                    >
                                        <div className="flex flex-1 flex-col rounded-lg border border-alloy-stone/15 bg-white p-3 text-xs text-[#273f52]">
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
                            <div className="flex flex-1 flex-col bg-white p-3 text-xs text-[#273f52]">BOS rail (fixture)</div>
                        </div>,
                        document.body,
                    )
                :   null}

                <ActionWorkspaceBosShell
                    open
                    presentation="workspace-drawer"
                    step="gather"
                    title="Create Lead"
                    contentBleed
                    onClose={() => undefined}
                    data-testid="create-lead-action-workspace"
                >
                    <div data-testid="create-lead-gather-step" className="p-6 text-sm text-alloy-midnight/80">
                        Create Lead workspace drawer regression fixture
                    </div>
                </ActionWorkspaceBosShell>
            </div>
        </div>
    );
}
