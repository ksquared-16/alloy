"use client";

import {
    useEffect,
    useLayoutEffect,
    useState,
    type CSSProperties,
    type MouseEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { BOS_ACTION_WORKSPACE_OPEN_ATTR } from "@/lib/bos/bosRailPresentationFlags";
import {
    DRAWER_BACKDROP_LEFT_CSS_VAR,
    DRAWER_BACKDROP_RIGHT_CSS_VAR,
    DRAWER_COMPUTED_LEFT_CSS_VAR,
    DRAWER_COMPUTED_WIDTH_CSS_VAR,
    isDrawerGeometryProbeActive,
    measureAndApplyDrawerWorkspaceGeometry,
} from "@/lib/bos/drawerWorkspaceGeometry";
import { LAYOUT_RUNTIME_DRAWER_OUTER_BORDER } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { neutral } from "@/styles/tokens/colors";

export type AdminV2WorkspaceBosModalShellProps = {
    open: boolean;
    onClose: () => void;
    /** Root marker for tests/diagnostics, e.g. `adminv2-inbox-modal`. */
    dataModalAttr: string;
    ariaLabelledBy: string;
    children: ReactNode;
    /** Extra panel classes (height caps, min-height). Width comes from drawer geometry vars. */
    panelClassName?: string;
};

/**
 * Workspace pop-out shell (Inbox, My Tasks) — same BOS-rail drawer band as entity drawers.
 * Does not replace drawer contents; only backdrop, geometry, and panel frame.
 */
export default function AdminV2WorkspaceBosModalShell({
    open,
    onClose,
    dataModalAttr,
    ariaLabelledBy,
    children,
    panelClassName = "",
}: AdminV2WorkspaceBosModalShellProps) {
    const [portalReady, setPortalReady] = useState(false);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useLayoutEffect(() => {
        if (!open || !portalReady) return;
        if (isDrawerGeometryProbeActive()) return;
        measureAndApplyDrawerWorkspaceGeometry();
    }, [open, portalReady]);

    useEffect(() => {
        if (!open) return;
        const root = document.documentElement;
        const remeasure = () => {
            if (isDrawerGeometryProbeActive()) return;
            if (root.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR) === "true") return;
            measureAndApplyDrawerWorkspaceGeometry(root);
        };
        const mo = new MutationObserver(remeasure);
        mo.observe(root, { attributes: true, attributeFilter: [BOS_ACTION_WORKSPACE_OPEN_ATTR] });
        return () => mo.disconnect();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open || !portalReady || typeof document === "undefined") {
        return null;
    }

    const backdropStyle: CSSProperties = {
        zIndex: ADMINV2_DRAWER_BACKDROP_Z,
        left: `var(${DRAWER_BACKDROP_LEFT_CSS_VAR})`,
        right: `calc(100vw - var(${DRAWER_BACKDROP_RIGHT_CSS_VAR}))`,
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
    };

    const closeOnBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
    };

    return createPortal(
        <>
            <div
                className="adminv2-drawer-backdrop-hit adminv2-drawer-modal-dim pointer-events-auto fixed transition-opacity duration-200 adminv2-drawer-workspace-backdrop-band"
                style={backdropStyle}
                aria-hidden
                onMouseDown={closeOnBackdropMouseDown}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabelledBy}
                data-adminv2-drawer="true"
                data-adminv2-workspace-bos-modal="true"
                data-adminv2-bos-modal={dataModalAttr}
                className={`adminv2-drawer-modal-panel adminv2-drawer-shell-inset pointer-events-auto fixed flex max-h-[min(920px,100%)] flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 adminv2-drawer-modal-panel--bos-rail ${panelClassName}`.trim()}
                style={panelStyle}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </>,
        document.body
    );
}
