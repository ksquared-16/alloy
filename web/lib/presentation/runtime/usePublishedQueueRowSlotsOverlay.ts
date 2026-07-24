/**
 * Live override of compact queue-row slots after Surface Builder publish.
 *
 * D1 freezes rowSlots into the provisioning snapshot at commit. Focus never un-commits.
 * When the operator publishes a Queue Row surface in the same browser session, this hook
 * re-fetches the published layout and rematches Default + variants onto each row so
 * CondensedQueueRow reflects the new config without a full Work Unit remount / hard reload.
 *
 * Critical: replacing only Default slots and merging into STALE per-row variant configs
 * leaves old contact email (and other variant-owned fieldKeys) in place after Default edits.
 * Rematch from the full published layout document.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import {
    QUEUE_ROW_SURFACE_PUBLISHED_EVENT,
    QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL,
} from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import { loadQueueRowSurfaceConfig } from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import {
    mapQueueRowSurfaceToCompactConfig,
    type CompactRowSlots,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { clearProvisioningPrefetchCache } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

export type PublishedQueueRowLayoutOverlay = {
    layout: QueueRecordLayoutConfigV3;
    defaultSlots: CompactRowSlots;
    source: string;
    surfaceId: string;
    processKey: string | null;
    fetchedAt: string;
};

export function usePublishedQueueRowSlotsOverlay(args: {
    surfaceId: string | null | undefined;
    processKey?: string | null;
    enabled?: boolean;
}): PublishedQueueRowLayoutOverlay | null {
    const surfaceId = args.surfaceId?.trim() || null;
    const processKey = args.processKey ?? null;
    const enabled = args.enabled !== false;
    const [override, setOverride] = useState<PublishedQueueRowLayoutOverlay | null>(null);

    const refresh = useCallback(async () => {
        if (!surfaceId || !enabled) return;
        clearProvisioningPrefetchCache();
        try {
            const loaded = await loadQueueRowSurfaceConfig(surfaceId, processKey);
            const defaultSlots = mapQueueRowSurfaceToCompactConfig(loaded.envelope.layout).slots;
            setOverride({
                layout: loaded.envelope.layout,
                defaultSlots,
                source: loaded.source,
                surfaceId,
                processKey,
                fetchedAt: new Date().toISOString(),
            });
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
