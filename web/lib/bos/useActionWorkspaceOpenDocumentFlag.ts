"use client";

import { useEffect } from "react";

import { closeAllWorkspaceModals } from "@/lib/adminV2/workspaceModalCoordinator";
import { setActionWorkspaceOpenDocumentFlag } from "@/lib/bos/bosRailPresentationFlags";

/** Marks document while BOS Action Workspace overlay is open — suppresses persistent BOS rail. */
export function useActionWorkspaceOpenDocumentFlag(open: boolean, presentation: "overlay" | "embedded" = "overlay") {
    useEffect(() => {
        if (!open || presentation === "embedded") {
            setActionWorkspaceOpenDocumentFlag(false);
            return;
        }

        closeAllWorkspaceModals();
        setActionWorkspaceOpenDocumentFlag(true);

        return () => {
            setActionWorkspaceOpenDocumentFlag(false);
        };
    }, [open, presentation]);
}
