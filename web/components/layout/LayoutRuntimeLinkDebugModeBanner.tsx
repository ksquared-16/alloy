"use client";

import { isLayoutRuntimeLinkDebugEnabled } from "@/lib/layout/runtime/layoutRuntimeLinkDebug";

/** Visible banner when link debug mode is active — no console required. */
export default function LayoutRuntimeLinkDebugModeBanner() {
    if (!isLayoutRuntimeLinkDebugEnabled()) return null;
    return (
        <div
            className="mb-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950"
            data-layout-runtime-link-debug-mode="true"
        >
            Layout runtime link debug ON — badges show handler, target id, and click status. Child rows include Test open.
        </div>
    );
}
