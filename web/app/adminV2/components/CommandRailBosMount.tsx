"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import AICommandBar from "./AICommandBar";
import AICommandSurfaceShell from "./aiCommandSurface/AICommandSurfaceShell";
import { ADMINV2_COMMAND_SURFACE_Z } from "@/components/admin/Drawer";
import { isWorkspaceCommandRailBosHost } from "@/lib/bos/bosRailOverlayAnchor";
import { useBosRailOverlayAnchorStyle } from "@/lib/bos/useBosRailOverlayAnchorStyle";
import { useBosRailOverlayDrawerDocumentFlag } from "@/lib/bos/useBosRailOverlayDrawerDocumentFlag";

const CommandRailBosHostContext = createContext<((el: HTMLElement | null) => void) | null>(null);

export function useCommandRailBosHostRef() {
    const register = useContext(CommandRailBosHostContext);
    return useCallback(
        (el: HTMLElement | null) => {
            register?.(el);
        },
        [register]
    );
}

function adminV2AiCommandSurfaceEnabled(): boolean {
    return true;
}

function CommandRailBosDockContent() {
    return (
        <div className="adminv2-ws-command-rail-bos-dock flex min-h-0 flex-1 flex-col">
            {adminV2AiCommandSurfaceEnabled() ?
                <AICommandSurfaceShell presentation="rail" />
            :   <AICommandBar />}
        </div>
    );
}

/**
 * Keeps BOS mounted in the shell while portaling UI into the workspace Actions rail.
 * Workspace routes use a fixed body overlay aligned to the rail anchor so BOS stays above drawers.
 */
export function CommandRailBosMount({ children }: { children: ReactNode }) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [bodyOverlay, setBodyOverlay] = useState(false);
    const [portalReady, setPortalReady] = useState(false);

    const registerHost = useCallback((el: HTMLElement | null) => {
        setAnchorEl(el);
        setBodyOverlay(isWorkspaceCommandRailBosHost(el));
    }, []);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useBosRailOverlayDrawerDocumentFlag(bodyOverlay);

    const overlayStyle = useBosRailOverlayAnchorStyle(anchorEl, bodyOverlay);

    const dockContent = <CommandRailBosDockContent />;

    return (
        <CommandRailBosHostContext.Provider value={registerHost}>
            {children}
            {portalReady && anchorEl && bodyOverlay ?
                createPortal(
                    <div
                        data-adminv2-bos-rail-overlay="true"
                        className="adminv2-bos-rail-overlay pointer-events-auto flex min-h-0 flex-col"
                        style={{ ...overlayStyle, zIndex: ADMINV2_COMMAND_SURFACE_Z }}
                    >
                        {dockContent}
                    </div>,
                    document.body
                )
            : portalReady && anchorEl && !bodyOverlay ?
                createPortal(dockContent, anchorEl)
            :   null}
        </CommandRailBosHostContext.Provider>
    );
}
