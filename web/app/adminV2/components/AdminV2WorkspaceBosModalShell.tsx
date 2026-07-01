"use client";

import {
    useEffect,
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
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import { DRAWER_BACKDROP_LEFT_CSS_VAR } from "@/lib/bos/drawerWorkspaceGeometry";
import {
    OPERATIONAL_WORKSPACE_ATTR,
    OPERATIONAL_WORKSPACE_LEFT_CSS_VAR,
    OPERATIONAL_WORKSPACE_SURFACE_CLASS,
    OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR,
} from "@/lib/bos/operationalWorkspaceGeometry";
import { useOperationalWorkspaceGeometry } from "@/lib/bos/useOperationalWorkspaceGeometry";
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

    // Operational Workspace Geometry — shared platform layout (sidebar → BOS rail band).
    useOperationalWorkspaceGeometry(open && portalReady);

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
        right: 0,
    };

    const panelStyle: CSSProperties = {
        zIndex: ADMINV2_DRAWER_PANEL_Z,
        backgroundColor: neutral.surface,
        color: neutral.textPrimary,
        borderTopColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
        borderRightColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
        borderBottomColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
        borderLeftColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
        left: `var(${OPERATIONAL_WORKSPACE_LEFT_CSS_VAR})`,
        width: `var(${OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR})`,
        maxWidth: `var(${OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR})`,
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
                {...{ [OPERATIONAL_WORKSPACE_ATTR]: "true" }}
                {...alloySectionDomAttrs("WU-15")}
                className={`adminv2-drawer-modal-panel adminv2-drawer-shell-inset pointer-events-auto fixed flex max-h-[min(920px,100%)] flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 adminv2-drawer-modal-panel--bos-rail ${OPERATIONAL_WORKSPACE_SURFACE_CLASS} ${panelClassName}`.trim()}
                style={panelStyle}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </>,
        document.body
    );
}
