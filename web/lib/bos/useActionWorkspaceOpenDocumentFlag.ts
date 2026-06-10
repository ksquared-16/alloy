"use client";

import { useEffect } from "react";

import { setActionWorkspaceOpenDocumentFlag } from "@/lib/bos/bosRailPresentationFlags";

/** Marks document while BOS Action Workspace overlay is open — suppresses persistent BOS rail. */
export function useActionWorkspaceOpenDocumentFlag(open: boolean, presentation: "overlay" | "embedded" = "overlay") {
    useEffect(() => {
        if (!open || presentation === "embedded") {
            setActionWorkspaceOpenDocumentFlag(false);
            return;
        }

        setActionWorkspaceOpenDocumentFlag(true);

        return () => {
            setActionWorkspaceOpenDocumentFlag(false);
        };
    }, [open, presentation]);
}
