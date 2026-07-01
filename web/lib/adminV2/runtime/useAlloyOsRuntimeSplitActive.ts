"use client";

import { useSyncExternalStore } from "react";

import { ALLOY_OS_RUNTIME_SPLIT_ATTR } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

/**
 * Reactively reads the Alloy OS runtime split state from the document root.
 *
 * `AlloyOsRuntimeSplitController` sets `html[data-alloy-os-runtime-split="true"]` (State 2:
 * compressed queue + docked Focus Panel). This hook lets components (e.g. `QueueBlock`) render
 * the compressed presentation in lockstep with the same signal that drives the CSS geometry —
 * no separate flag plumbing, no remount. Returns `false` on the server and whenever the build
 * flag is off, so flag-off output is unchanged.
 */
function subscribe(onChange: () => void): () => void {
    if (typeof document === "undefined") return () => {};
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [ALLOY_OS_RUNTIME_SPLIT_ATTR],
    });
    return () => observer.disconnect();
}

function getSnapshot(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute(ALLOY_OS_RUNTIME_SPLIT_ATTR) === "true";
}

export function useAlloyOsRuntimeSplitActive(): boolean {
    const active = useSyncExternalStore(subscribe, getSnapshot, () => false);
    return active;
}
