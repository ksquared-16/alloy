/**
 * Live override of compact queue-row slots after Surface Builder publish.
 *
 * D1 freezes rowSlots into the provisioning snapshot at commit. Focus never un-commits.
 * When the operator publishes a Queue Row surface in the same browser session, this hook
 * re-fetches the published layout and maps it onto the compact anatomy so CondensedQueueRow
 * reflects the new config without a full Work Unit remount / hard reload.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import {
    QUEUE_ROW_SURFACE_PUBLISHED_EVENT,
    QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL,
} from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import { loadQueueRowSurfaceConfig } from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import {
    mapQueueRowSurfaceToCompactConfig,
    type CompactRowSlots,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { clearProvisioningPrefetchCache } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

export function usePublishedQueueRowSlotsOverlay(args: {
    surfaceId: string | null | undefined;
    processKey?: string | null;
    enabled?: boolean;
}): CompactRowSlots | null {
    const surfaceId = args.surfaceId?.trim() || null;
    const processKey = args.processKey ?? null;
    const enabled = args.enabled !== false;
    const [override, setOverride] = useState<CompactRowSlots | null>(null);

    const refresh = useCallback(async () => {
        if (!surfaceId || !enabled) return;
        clearProvisioningPrefetchCache();
        try {
            const loaded = await loadQueueRowSurfaceConfig(surfaceId, processKey);
            setOverride(mapQueueRowSurfaceToCompactConfig(loaded.envelope.layout).slots);
        } catch {
            /* keep prior override / committed snapshot slots */
        }
    }, [surfaceId, processKey, enabled]);

    useEffect(() => {
        if (!enabled || !surfaceId || typeof window === "undefined") return;

        // Always re-read published layout on mount — D1 `qrl:` cache can lag a Surface Builder
        // publish from another tab/session, and CondensedQueueRow must show Default children.
        void refresh();

        const onLocal = (event: Event) => {
            const detail = (event as CustomEvent<{ surfaceId?: string }>).detail;
            if (detail?.surfaceId && detail.surfaceId !== surfaceId) return;
            void refresh();
        };

        window.addEventListener(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, onLocal);

        let channel: BroadcastChannel | null = null;
        try {
            channel = new BroadcastChannel(QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL);
            channel.onmessage = (msg) => {
                const data = msg.data as { surfaceId?: string } | null;
                if (data?.surfaceId && data.surfaceId !== surfaceId) return;
                void refresh();
            };
        } catch {
            /* BroadcastChannel unavailable */
        }

        return () => {
            window.removeEventListener(QUEUE_ROW_SURFACE_PUBLISHED_EVENT, onLocal);
            channel?.close();
        };
    }, [enabled, surfaceId, refresh]);

    return override;
}
