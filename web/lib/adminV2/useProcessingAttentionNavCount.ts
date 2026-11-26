"use client";

import { useCallback, useEffect, useState } from "react";

import { ADMIN_V2_PROCESSING_QUEUE_REFRESH } from "@/lib/workItems/operationalWorkRefresh";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { isAdminV2SidecarNetworkBlocked } from "@/lib/perf/adminV2PrimarySurfaceGate";

/**
 * The Processing nav badge: actionable intake no operator has acted on yet
 * (`/api/admin/processing/attention`, rule in processingCaseAttention).
 *
 * Re-reads on the canonical Processing refresh (`ADMIN_V2_PROCESSING_QUEUE_REFRESH`, dispatched after
 * every Processing decision), and on a short interval — a public form submission arrives from outside
 * this session, so no in-app event announces it.
 */
export function useProcessingAttentionNavCount(): number {
    const [count, setCount] = useState(0);

    const load = useCallback(async () => {
        if (isAdminV2SidecarNetworkBlocked()) return;
        try {
            const res = await fetch("/api/admin/processing/attention", { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as { data?: { unworked_count?: number } };
            if (res.ok && typeof json.data?.unworked_count === "number") setCount(json.data.unworked_count);
        } catch {
            /* non-fatal — the badge keeps its last value */
        }
    }, []);

    useEffect(() => {
        const cancelDefer = runWhenAdminV2PrimarySurfaceReady(() => load(), "processing_attention_nav");
        const intervalId = window.setInterval(() => void load(), 60_000);
        const onRefresh = () => void load();
        window.addEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, onRefresh);
        return () => {
            cancelDefer();
            window.clearInterval(intervalId);
            window.removeEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, onRefresh);
        };
    }, [load]);

    return count;
}
