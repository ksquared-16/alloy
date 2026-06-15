"use client";

import { useEffect } from "react";

/** Applies workspace shell marker on `<html>` so portaled drawers inherit shell CSS. */
export function useAdminV2WorkspaceShellDocumentFlag(): void {
    useEffect(() => {
        document.documentElement.setAttribute("data-adminv2-workspace-shell", "v2");
        return () => {
            document.documentElement.removeAttribute("data-adminv2-workspace-shell");
        };
    }, []);
}
