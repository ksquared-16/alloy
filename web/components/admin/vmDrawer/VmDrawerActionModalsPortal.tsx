"use client";

import { createPortal, useEffect, useState, type ReactNode } from "react";

type Props = {
    children: ReactNode;
};

/**
 * Portals VM drawer action modals to document.body so fixed overlays stack above
 * the portaled drawer panel (z-70) regardless of workspace DOM ancestry.
 */
export default function VmDrawerActionModalsPortal({ children }: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !children) return null;

    return createPortal(
        <div data-vm-drawer-action-modals-host="true">{children}</div>,
        document.body,
    );
}
