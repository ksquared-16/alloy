"use client";

import { useEffect } from "react";

import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";

/** Applies `data-bos-right-rail-copilot` on `<html>` so portaled drawers respect rail offset. */
export function useBosRightRailCopilotDocumentFlag(): boolean {
    const enabled = isBosRightRailCopilotEnabledClient();

    useEffect(() => {
        if (!enabled) return;
        document.documentElement.setAttribute("data-bos-right-rail-copilot", "true");
        return () => {
            document.documentElement.removeAttribute("data-bos-right-rail-copilot");
        };
    }, [enabled]);

    return enabled;
}
