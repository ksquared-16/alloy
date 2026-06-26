"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
    getProcessingQueueWarmSnapshot,
    subscribeProcessingQueueWarm,
    warmProcessingQueueCache,
    type ProcessingQueueWarmData,
    type ProcessingQueueWarmState,
} from "@/lib/pos/processingQueueWarmCache";

const SERVER_SNAPSHOT: ProcessingQueueWarmState = { data: null, fetchedAt: null, error: null };

export interface UseProcessingQueueWarmResult {
    data: ProcessingQueueWarmData | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

/**
 * Shared accessor for the Processing → Incoming queue. The KPI strip and the queue list both call
 * this hook, so they read one cache and dedupe to a single network request. On mount it triggers a
 * (deduped, stale-guarded) warm; if a warm cache already exists the surface paints immediately and
 * refreshes quietly in place.
 */
export function useProcessingQueueWarm(): UseProcessingQueueWarmResult {
    const state = useSyncExternalStore(
        subscribeProcessingQueueWarm,
        getProcessingQueueWarmSnapshot,
        () => SERVER_SNAPSHOT,
    );

    useEffect(() => {
        void warmProcessingQueueCache();
    }, []);

    const refresh = useCallback(() => {
        void warmProcessingQueueCache({ force: true });
    }, []);

    return {
        data: state.data,
        loading: state.data == null && state.error == null,
        error: state.error,
        refresh,
    };
}
