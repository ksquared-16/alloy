"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { BosOperationalIntakeShellFrame } from "@/components/admin/actions/BosOperationalIntakeShellFrame";
import {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { useActionWorkspaceOpenDocumentFlag } from "@/lib/bos/useActionWorkspaceOpenDocumentFlag";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    clearActionWorkspaceGeometryIfIdle,
    measureAndApplyActionWorkspaceGeometry,
} from "@/lib/admin/actions/actionWorkspaceGeometry";
import { ACTION_WORKSPACE_LAYER_Z } from "@/lib/admin/actions/actionWorkspaceLayer";
import {
    BOS_ACTION_WORKSPACE_FORGE_PERIMETER_STYLE,
    BOS_ACTION_WORKSPACE_VIEWPORT_SCRIM_STYLE,
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_CANVAS_CONTENT_MAX_WIDTH,
    BOS_CANVAS_CONTENT_PADDING_X,
    BOS_SHELL_HEADER_PADDING,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_SHELL_TERRITORY_TITLE,
    BOS_WORKSPACE_BAND_BACKDROP_STYLE,
    BOS_WORKSPACE_EMBEDDED_HEIGHT,
    BOS_WORKSPACE_PANEL_HEIGHT,
    BOS_WORKSPACE_PANEL_SHADOW,
    BOS_WORKSPACE_RADIUS,
    BOS_WORKSPACE_WIDTH,
    CREATE_LEAD_WORKSPACE_TITLE,
} from "@/lib/admin/actions/bosWorkspaceShell";
import {
    DRAWER_BACKDROP_LEFT_CSS_VAR,
    DRAWER_COMPUTED_LEFT_CSS_VAR,
    DRAWER_COMPUTED_WIDTH_CSS_VAR,
    isDrawerGeometryProbeActive,
} from "@/lib/bos/drawerWorkspaceGeometry";
import { LAYOUT_RUNTIME_DRAWER_OUTER_BORDER } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { neutral } from "@/styles/tokens/colors";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";

type Presentation = "workspace-drawer" | "overlay" | "embedded";

type Props = {
    open: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
    busy?: boolean;
    presentation?: Presentation;
    /** Dev-only — stadium shell for before/after capture; production uses legacy-rect. */
    shellVariant?: "locked" | "legacy-rect";
    /** Full-bleed body for two-column operational intake. */
    contentBleed?: boolean;
    /** Integrated white header vs legacy midnight territory band. */
    headerTone?: "integrated" | "territory";
    "data-testid"?: string;
};

/**
 * BOS Action Workspace — default presentation is workspace drawer (sidebar + BOS rail stay visible).
 */
export function ActionWorkspaceBosShell({
    open,
    onClose,
    title,
    description,
    step,
    children,
    footer,
    busy = false,
    presentation = "workspace-drawer",
    shellVariant = "legacy-rect",
    contentBleed = false,
    headerTone = "integrated",
    "data-testid": dataTestId = "action-workspace-bos",
}: Props) {
    const embedded = presentation === "embedded";
    const workspaceDrawer = presentation === "workspace-drawer";
    useActionWorkspaceOpenDocumentFlag(open, presentation === "overlay" ? "overlay" : "embedded");

    useLayoutEffect(() => {
        if (!open || embedded || !workspaceDrawer) return;
        if (isDrawerGeometryProbeActive()) return;
        measureAndApplyActionWorkspaceGeometry();
    }, [open, embedded, workspaceDrawer]);

    useEffect(() => {
        if (!open || embedded) return;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [open, embedded]);

    useLayoutEffect(() => {
        if (!open || embedded || !workspaceDrawer) return;
        const remeasure = () => {
            if (isDrawerGeometryProbeActive()) return;
            measureAndApplyActionWorkspaceGeometry();
        };
        window.addEventListener("resize", remeasure);
        const sidebar = document.querySelector("[data-adminv2-sidebar='true']");
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
        if (sidebar && ro) ro.observe(sidebar);
        const bos = document.querySelector("[data-adminv2-bos-rail-overlay='true']");
        if (bos && ro) ro.observe(bos);
        return () => {
            window.removeEventListener("resize", remeasure);
            ro?.disconnect();
            clearActionWorkspaceGeometryIfIdle();
        };
    }, [open, embedded, workspaceDrawer]);

    useEffect(() => {
        if (!open || embedded) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, embedded, busy, onClose]);

    if (!open) return null;

    const tagline = description?.trim() || BOS_SHELL_TERRITORY_TAGLINE;
    const integratedHeader = headerTone === "integrated";
    const headerTitle = title?.trim() || CREATE_LEAD_WORKSPACE_TITLE;
    const headerSubtitle = tagline;
    const integratedDrawerHeader = workspaceDrawer && integratedHeader;

    const contentWrapStyle = {
        maxWidth: BOS_CANVAS_CONTENT_MAX_WIDTH,
        width: "100%",
        margin: "0 auto",
        paddingLeft: contentBleed ? 28 : BOS_CANVAS_CONTENT_PADDING_X,
        paddingRight: contentBleed ? 28 : BOS_CANVAS_CONTENT_PADDING_X,
    };

    const overlayPanelHeight = embedded ? BOS_WORKSPACE_EMBEDDED_HEIGHT : BOS_WORKSPACE_PANEL_HEIGHT;

    const overlayPanelStyle = {
        width: BOS_WORKSPACE_WIDTH,
        height: overlayPanelHeight,
        maxHeight: "100%",
        ...(shellVariant === "legacy-rect" ? { borderRadius: BOS_WORKSPACE_RADIUS } : {}),
        ...BOS_WORKSPACE_PANEL_SHADOW,
    };

    const workspacePanel = (
        <div
            role={workspaceDrawer ? undefined : "dialog"}
            aria-modal={workspaceDrawer ? undefined : !embedded}
            aria-label={workspaceDrawer ? undefined : headerTitle}
            className={
                integratedDrawerHeader ?
                    "action-workspace-bos-shell relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit] bg-white"
                :   "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
            }
            data-action-workspace-panel="true"
            data-action-workspace-bos-workspace="true"
            data-bos-operational-intake-shell-variant={shellVariant}
            data-action-workspace-header-tone={headerTone}
        >
            {integratedDrawerHeader ?
                <>
                    <div className="bos-workspace-shell__perimeter pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
                    <div className="bos-workspace-shell__atmosphere pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
                    <div
                        className="pointer-events-none absolute inset-0 rounded-[inherit]"
                        style={BOS_ACTION_WORKSPACE_FORGE_PERIMETER_STYLE}
                        aria-hidden
                    />
                </>
            :   null}
            <header
                className={
                    integratedHeader ?
                        "relative shrink-0 border-b border-alloy-stone/10 bg-white"
                    :   "relative shrink-0 text-white"
                }
                style={
                    integratedHeader ?
                        integratedDrawerHeader ?
                            { padding: BOS_SHELL_HEADER_PADDING }
                        :   { padding: BOS_SHELL_HEADER_PADDING, boxShadow: "inset 0 2px 0 0 #273F52" }
                    :   { padding: BOS_SHELL_HEADER_PADDING, background: BOS_SHELL_MIDNIGHT_FORGE }
                }
                data-action-workspace-territory-header="true"
            >
                <div style={contentWrapStyle}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0" data-action-workspace-bos-brand="true">
                            {integratedDrawerHeader ?
                                <BosHeader
                                    title={headerTitle}
                                    subtitle={headerSubtitle}
                                    size="lg"
                                />
                            :   <BosHeader
                                    title={integratedHeader ? headerTitle : BOS_SHELL_TERRITORY_TITLE}
                                    subtitle={headerSubtitle}
                                    size="md"
                                    onDark={!integratedHeader}
                                />
                            }
                        </div>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onClose}
                            className={
                                integratedHeader ?
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-alloy-stone/15 bg-white text-alloy-midnight/45 transition-colors hover:border-alloy-stone/25 hover:bg-alloy-stone/5 hover:text-alloy-midnight/80 disabled:opacity-50"
                                :   "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
                            }
                            data-testid="action-workspace-close"
                            aria-label="Close"
                        >
                            <X className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                    </div>
                    <div className="mt-3">
                        <ActionWorkspaceStepRail activeStep={step} onDark={!integratedHeader} />
                    </div>
                </div>
            </header>

            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
                data-action-workspace-content="true"
                data-action-workspace-step={step}
            >
                <div
                    className={`flex min-h-0 flex-1 flex-col overflow-hidden ${contentBleed ? "" : "overflow-y-auto pt-3 pb-4"}`}
                    style={contentBleed ? undefined : contentWrapStyle}
                >
                    {children}
                </div>
            </div>

            {footer ?
                <footer
                    className="shrink-0 border-t border-alloy-stone/10 bg-white px-8 py-3.5"
                    data-action-workspace-footer="true"
                >
                    <div
                        className="flex items-center justify-end gap-3"
                        style={contentBleed ? undefined : contentWrapStyle}
                    >
                        {footer}
                    </div>
                </footer>
            :   null}
        </div>
    );

    const shellFrame =
        shellVariant === "locked" ?
            <BosOperationalIntakeShellFrame variant="locked" style={workspaceDrawer ? undefined : overlayPanelStyle}>
                {workspacePanel}
            </BosOperationalIntakeShellFrame>
        :   workspaceDrawer ?
            workspacePanel
        :   <div
                className="relative flex min-h-0 flex-col overflow-hidden border border-alloy-stone/15 bg-white"
                style={overlayPanelStyle}
                data-bos-operational-intake-shell="legacy-rect"
            >
                {workspacePanel}
            </div>;

    if (workspaceDrawer) {
        const backdropStyle: CSSProperties = {
            zIndex: ADMINV2_DRAWER_BACKDROP_Z,
            left: `var(${DRAWER_BACKDROP_LEFT_CSS_VAR})`,
            right: 0,
            ...BOS_WORKSPACE_BAND_BACKDROP_STYLE,
        };

        const panelStyle: CSSProperties = {
            zIndex: ADMINV2_DRAWER_PANEL_Z,
            backgroundColor: neutral.surface,
            color: neutral.textPrimary,
            borderTopColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
            borderRightColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
            borderBottomColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
            borderLeftColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
            left: `var(${DRAWER_COMPUTED_LEFT_CSS_VAR})`,
            width: `var(${DRAWER_COMPUTED_WIDTH_CSS_VAR})`,
            maxWidth: `var(${DRAWER_COMPUTED_WIDTH_CSS_VAR})`,
            transform: "none",
            right: "auto",
            borderRadius: BOS_WORKSPACE_RADIUS,
            ...BOS_WORKSPACE_PANEL_SHADOW,
        };

        const closeOnBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
            if (e.target !== e.currentTarget) return;
            if (busy) return;
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };

        const drawer = (
            <>
                <div
                    data-action-workspace-viewport-scrim="true"
                    className="pointer-events-none fixed inset-0"
                    style={{ zIndex: ADMINV2_DRAWER_BACKDROP_Z - 5, ...BOS_ACTION_WORKSPACE_VIEWPORT_SCRIM_STYLE }}
                    aria-hidden
                >
                    <div
                        className="absolute left-1/2 top-[38%] h-[min(820px,72vh)] w-[min(1120px,92vw)] -translate-x-1/2 -translate-y-1/2 scale-105"
                        style={BOS_AMBIENT_GLOW_STYLE}
                        aria-hidden
                    />
                </div>
                <div
                    className="adminv2-drawer-backdrop-hit adminv2-drawer-modal-dim pointer-events-auto fixed transition-opacity duration-200 adminv2-drawer-workspace-backdrop-band action-workspace-band-backdrop"
                    style={backdropStyle}
                    aria-hidden
                    data-action-workspace-overlay="true"
                    data-action-workspace-shell="bos"
                    data-action-workspace-presentation={presentation}
                    data-testid={dataTestId}
                    onMouseDown={closeOnBackdropMouseDown}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={headerTitle}
                    data-adminv2-drawer="true"
                    data-action-workspace-bos-drawer="true"
                    data-action-workspace-shell="bos"
                    data-action-workspace-presentation={presentation}
                    data-testid={dataTestId}
                    className="adminv2-drawer-modal-panel adminv2-drawer-shell-inset pointer-events-auto fixed flex max-h-[min(920px,100%)] min-h-0 flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl adminv2-drawer-modal-panel--bos-rail action-workspace-bos-drawer-panel"
                    style={panelStyle}
                    onClick={(e) => e.stopPropagation()}
                >
                    {shellFrame}
                </div>
            </>
        );

        if (typeof document === "undefined") return drawer;
        return createPortal(drawer, document.body);
    }

    const overlayClass = embedded ?
        "relative flex w-full items-center justify-center"
    :   "fixed inset-0 flex items-center justify-center p-4";

    const overlayStyle = embedded ? undefined : { zIndex: ACTION_WORKSPACE_LAYER_Z };

    const overlay = (
        <div
            className={overlayClass}
            style={overlayStyle}
            data-action-workspace-overlay="true"
            data-action-workspace-shell="bos"
            data-action-workspace-presentation={presentation}
            data-testid={dataTestId}
            onClick={() => {
                if (!busy && !embedded) onClose();
            }}
        >
            {!embedded ?
                <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            :   null}

            <div
                className="relative z-[1] flex max-h-full w-full items-center justify-center"
                style={{ maxWidth: BOS_WORKSPACE_WIDTH }}
                onClick={(e) => e.stopPropagation()}
            >
                {shellFrame}
            </div>
        </div>
    );

    if (embedded || typeof document === "undefined") {
        return overlay;
    }

    return createPortal(overlay, document.body);
}
