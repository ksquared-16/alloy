"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import AICommandBar from "./AICommandBar";
import AICommandSurfaceShell from "./aiCommandSurface/AICommandSurfaceShell";
import { BosFloatingResizeHandle } from "./aiCommandSurface/bosRail/BosRailPresentation";
import { ADMINV2_COMMAND_SURFACE_Z, ADMINV2_RAIL_MENU_Z } from "@/components/admin/Drawer";
import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
import { isWorkspaceCommandRailBosHost } from "@/lib/bos/bosRailOverlayAnchor";
import { useBosRailOverlayAnchorStyle } from "@/lib/bos/useBosRailOverlayAnchorStyle";
import { useBosRailOverlayDrawerDocumentFlag } from "@/lib/bos/useBosRailOverlayDrawerDocumentFlag";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

const CommandRailBosHostContext = createContext<((el: HTMLElement | null) => void) | null>(null);

export function useCommandRailBosHostRef() {
    const register = useContext(CommandRailBosHostContext);
    return useCallback(
        (el: HTMLElement | null) => {
            register?.(el);
        },
        [register],
    );
}

function adminV2AiCommandSurfaceEnabled(): boolean {
    return true;
}

function CommandRailBosDockContent() {
    return (
        <div className="adminv2-ws-command-rail-bos-dock relative flex min-h-0 flex-1 flex-col">
            {adminV2AiCommandSurfaceEnabled() ?
                <AICommandSurfaceShell presentation="rail" />
            :   <AICommandBar />}
            <BosFloatingResizeHandle />
        </div>
    );
}

/**
 * Keeps BOS mounted in the shell while portaling UI into the workspace Actions rail.
 * Workspace routes use a fixed body overlay aligned to the rail anchor so BOS stays above drawers.
 * Floating mode uses operator-controlled absolute geometry (not the assistant column).
 */
export function CommandRailBosMount({ children }: { children: ReactNode }) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [bodyOverlay, setBodyOverlay] = useState(false);
    const [portalReady, setPortalReady] = useState(false);
    const bos = useBosPresentationControllerOptional();
    const effective = bos?.derivation.effective;

    const registerHost = useCallback((el: HTMLElement | null) => {
        setAnchorEl(el);
        setBodyOverlay(isWorkspaceCommandRailBosHost(el));
    }, []);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useBosRailOverlayDrawerDocumentFlag(bodyOverlay && effective !== "closed");

    const pinnedOverlayStyle = useBosRailOverlayAnchorStyle(
        anchorEl,
        bodyOverlay && effective === "pinned",
    );

    const overlayStyle = useMemo((): CSSProperties => {
        if (effective === "closed") {
            return { visibility: "hidden", position: "fixed", pointerEvents: "none" };
        }
        if (effective === "floating" && bos) {
            /*
             * DO NOT EXPOSE A PLACEMENT THAT IS STILL A GUESS.
             *
             * Automatic parking measures the page's obstacles. On a cold direct boot it runs before
             * the Work Unit has revealed, so it measures a page whose content does not exist yet and
             * lands 495 px from where it settles — measured as 0.174 CLS, 97% of the page's total,
             * a horizontal jump seconds after load. The prepared path makes the same move; a click
             * merely lets the browser attribute it to recent input and drop it from scoring.
             *
             * `visibility: hidden` rather than opacity, deliberately: it removes the subtree from
             * the accessibility tree and from the tab order, and with `pointerEvents: none` nothing
             * invisible can intercept a click. Geometry is still applied, so when the placement
             * becomes trustworthy the rail appears where it belongs instead of travelling there.
             */
            const g = bos.floatingGeometry;
            if (!bos.floatingPlacementTrustworthy) {
                return {
                    position: "fixed",
                    left: g.x,
                    top: g.y,
                    width: g.width,
                    maxWidth: g.width,
                    height: g.height,
                    maxHeight: g.height,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    visibility: "hidden",
                    pointerEvents: "none",
                    right: "auto",
                    bottom: "auto",
                    boxSizing: "border-box",
                    overflow: "hidden",
                };
            }
            return {
                position: "fixed",
                left: g.x,
                top: g.y,
                width: g.width,
                maxWidth: g.width,
                height: g.height,
                maxHeight: g.height,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                visibility: "visible",
                right: "auto",
                bottom: "auto",
                boxSizing: "border-box",
                overflow: "hidden",
            };
        }
        return pinnedOverlayStyle;
    }, [effective, bos, pinnedOverlayStyle]);

    // Floating must sit above Operational Workspace modals (z≈70) without trapping as modal.
    const overlayZ =
        effective === "floating" ? Math.max(ADMINV2_COMMAND_SURFACE_Z, ADMINV2_RAIL_MENU_Z) : ADMINV2_COMMAND_SURFACE_Z;

    const dockContent = <CommandRailBosDockContent />;

    return (
        <CommandRailBosHostContext.Provider value={registerHost}>
            {children}
            {portalReady && anchorEl && bodyOverlay && effective !== "closed" ?
                createPortal(
                    <div
                        data-adminv2-bos-rail-overlay="true"
                        data-bos-overlay-mode={effective ?? undefined}
                        className="adminv2-bos-rail-overlay pointer-events-auto relative flex min-h-0 flex-col"
                        style={{ ...overlayStyle, zIndex: overlayZ }}
                        {...alloySectionDomAttrs("WU-14")}
                    >
                        {dockContent}
                    </div>,
                    document.body,
                )
            : portalReady && anchorEl && !bodyOverlay ?
                createPortal(dockContent, anchorEl)
            :   null}
        </CommandRailBosHostContext.Provider>
    );
}
