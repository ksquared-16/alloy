"use client";

/**
 * Queue Row Builder — data fetching and publish hooks.
 *
 * useQueueRowLayoutConfig: loads the current resolved QueueRecordLayoutConfigV3
 * from the server (published layout or built-in default). Also returns whether
 * the placement override affordance is enabled (waitlist only).
 *
 * useQueueRowPublish: calls the builder persistence endpoint to create and
 * publish a new LayoutDoc for the surface. Returns publishing state.
 */

import { useCallback, useEffect, useState } from "react";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

// ── Loader ─────────────────────────────────────────────────────────────────

type QueueRowLayoutData = {
    config: QueueRecordLayoutConfigV3;
    placementOverrideEnabled: boolean;
};

type UseQueueRowLayoutConfigResult = {
    data: QueueRowLayoutData | null;
    loading: boolean;
    error: string | null;
};

export function useQueueRowLayoutConfig(surfaceId: string): UseQueueRowLayoutConfigResult {
    const [state, setState] = useState<UseQueueRowLayoutConfigResult>({
        data: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;
        setState({ data: null, loading: true, error: null });

        fetch(`/api/admin/queue-row-layout/${encodeURIComponent(surfaceId)}`)
            .then(async (res) => {
                if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                    throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
                }
                return res.json() as Promise<{ config: QueueRecordLayoutConfigV3; placementOverrideEnabled: boolean }>;
            })
            .then(({ config, placementOverrideEnabled }) => {
                if (!cancelled)
                    setState({
                        data: { config, placementOverrideEnabled },
                        loading: false,
                        error: null,
                    });
            })
            .catch((err: unknown) => {
                if (!cancelled)
                    setState({ data: null, loading: false, error: (err as Error).message });
            });

        return () => {
            cancelled = true;
        };
    }, [surfaceId]);

    return state;
}

// ── Publisher ───────────────────────────────────────────────────────────────

type UseQueueRowPublishResult = {
    publish: (config: QueueRecordLayoutConfigV3, placementOverrideEnabled?: boolean) => Promise<void>;
    publishing: boolean;
    error: string | null;
    publishedAt: string | null;
};

export function useQueueRowPublish(surfaceId: string): UseQueueRowPublishResult {
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publishedAt, setPublishedAt] = useState<string | null>(null);

    const publish = useCallback(
        async (config: QueueRecordLayoutConfigV3, placementOverrideEnabled = false) => {
            setPublishing(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/admin/queue-row-layout/${encodeURIComponent(surfaceId)}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ config, placementOverrideEnabled }),
                    },
                );
                const body = (await res.json()) as Record<string, unknown>;
                if (!res.ok) {
                    throw new Error((body.error as string | undefined) ?? `HTTP ${res.status}`);
                }
                setPublishedAt(new Date().toISOString());
            } catch (err: unknown) {
                setError((err as Error).message);
            } finally {
                setPublishing(false);
            }
        },
        [surfaceId],
    );

    return { publish, publishing, error, publishedAt };
}
